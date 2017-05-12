'use strict'

const fs = require('fs');
const fsExtra = require('fs-extra');
const spawn = require('child_process').spawn;
const async = require('async');
const select = require('xpath.js');
const dom = require('xmldom').DOMParser;
const serializer = require('xmldom').XMLSerializer;

const resource = require('./lib/index.js');
const utility = require('./lib/utils.js');
const testConfig = JSON.parse(fs.readFileSync('./testConfig.json', 'utf8'));

// return list of azure resource:
// [ { type, resourcegroupname, name, address }]
function createAzureResource(clientId, tenantId, key, subsId, resourceConfigs, callback) {
    var results = [];

    if (resourceConfigs === null || resourceConfigs === '' || typeof resourceConfigs === undefined) {
        console.log('resourceConfigs no azure config');
        return callback();
    }

    async.each(resourceConfigs,
        function (config, cb) {
            if (config.type.toLowerCase() === 'vm') {
                // azure windows vm name length limitation 15..
                var name = config.name ||
                    (config.size.replace('Standard', '') + config.region.replace(' ', '') + config.os + config.type).split('_').join('').substring(0, 15);
                resource.createOrGetAzureVM(
                    clientId,
                    tenantId,
                    key,
                    subsId,
                    config.resourcegroup,
                    name,
                    config.region,
                    config.size,
                    config.os,
                    config.username,
                    config.password,
                    function (err, vmip) {
                        if (err) {
                            console.error(err);
                            return cb(err);
                        } else {
                            // create done, start it
                            resource.startAzureVM(
                                clientId,
                                tenantId,
                                key,
                                subsId,
                                config.resourcegroup,
                                name,
                                function (err, result) {
                                    if (err) {
                                        console.error(err);
                                        return cb(err);
                                    } else {
                                        // save resource group and vm name to results
                                        results.push({
                                            type: config.type, resourcegroup: config.resourcegroup, name: name, address: vmip, os: config.os,
                                            region: config.region, username: config.username, key: config.password, size: config.size
                                        });
                                        return cb(null);
                                    }
                                });
                        }
                    }
                );
            } else if (config.type.toLowerCase() === 'webapp') {
                var name = config.name ||
                    (config.size.replace('Standard', '') + config.region.replace(' ', '') + config.type).split('_').join('').substring(0, 15);
                resource.createOrGetAzureWebApp(
                    clientId,
                    tenantId,
                    key,
                    subsId,
                    config.resourcegroup,
                    name,
                    config.region,
                    config.size,
                    function (err, webapp) {
                        if (err) {
                            console.error(err);
                            return cb(err);
                        } else {
                            // create done, start it
                            resource.startAzureWebApp(
                                clientId,
                                tenantId,
                                key,
                                subsId,
                                config.resourcegroup,
                                name,
                                function (err, result) {
                                    if (err) {
                                        console.error(err);
                                        return cb(err);
                                    } else {
                                        // save resource group and app name to results
                                        results.push({ type: config.type, resourcegroup: config.resourcegroup, name: name, address: webapp.hostNames[0], size: config.size, region: config.region });
                                        return cb(null);
                                    }
                                });
                        }
                    });
            } else if (config.type.toLowerCase() === 'mysql') {
                // create mysql
                var name = config.name ||
                    (config.region.replace(' ', '') + config.tier + config.capacity + '-' + config.size).toLowerCase();
                resource.createMySqlServer(
                    clientId,
                    tenantId,
                    key,
                    subsId,
                    config.resourcegroup,
                    config.region.replace(' ', ''),
                    name,
                    config.username,
                    config.password,
                    config.tier,
                    config.capacity,
                    config.size,
                    function (err, mysqlServer) {
                        if (err) {
                            console.error(err);
                            return cb(err);
                        } else {
                            results.push({
                                type: config.type, resourcegroup: config.resourcegroup, name: mysqlServer.name, address: mysqlServer.name,
                                region: config.region, username: mysqlServer.username, password: mysqlServer.password, size: config.size
                            });
                            return cb(null);
                        }
                    }
                )
            }
            else {
                console.error('invalid resource type: ' + config.type);
                return cb('invalid resource type: ' + config.type);
            }
        }, function (err) {
            if (err) {
                console.error('creating azure resources failed..' + err);
                return callback(err, null);
            } else {
                console.log('creating azure resources done. \n' + JSON.stringify(results));
                return callback(null, results);
            }
        });
}

function runPsExecOnWindowsRemote(hostname, username, password, cmd, callback) {
    var psexec = spawn('PsExec.exe', ['\\\\' + hostname, '-u', username, '-p', password, cmd]);

    psexec.stdout.on('data', (data) => {
        console.log('stdout: ' + data);
        return callback(null, data);
    });

    psexec.stderr.on('data', (data) => {
        console.error(data);
        return callback(data, null);
    });

    psexec.on('close', (code) => {
        console.log('child process exited with code : ' + code);
        return callback(null, code);
    })
}

// deploy docker to VM
// vmInfos: [ { address, os, username, keyfile, key}]
function deployTestAppToVM(vmInfos, dockerImageName, mysqlEndpoint, mysqlUserName, mysqlPassword, callback) {
    async.each(vmInfos,
        function (vmInfo, cb) {
            if (vmInfo.os === 'windows') {
                // todo
                // for azure, use customized windows image which already have docker installed
                // for aws, customized image building..
            } else if (vmInfo.os === 'ubuntu') {
                // 1. install docker
                // 2. run docker run
                console.log('deploying test app to : ' + vmInfo.address);

                var cmds = 'sudo apt-get update && sudo apt-key adv --keyserver hkp://p80.pool.sks-keyservers.net:80 --recv-keys 58118E89F3A912897C070ADBF76221572C52609D && ' +
                    ' sudo apt-add-repository \'deb https://apt.dockerproject.org/repo ubuntu-xenial main\' && ' +
                    ' sudo apt-get update && ' +
                    ' apt-cache policy docker-engine && ' +
                    ' sudo apt-get install -y docker-engine && ' +
                    ' sudo usermod -aG docker $(whoami) && ' +
                    ' sudo apt-get install -y docker ';
                utility.sshExecCmd(vmInfo.address, vmInfo.username, vmInfo.keyfilename, vmInfo.key, cmds, { verbose: false, sshPrintCommands: true },
                    function (err) {
                        if (err) {
                            return cb(err);
                        }

                        var dockercmd = 'docker pull ' + dockerImageName + ' &&  ' +
                            ' docker run ' +
                            ' -e MYSQL_ENDPOINT=jdbc:mysql://' + mysqlEndpoint + ':3306/steelthread ' +
                            ' -e MYSQL_USERNAME=$\'' + mysqlUserName + '\'' +
                            ' -e MYSQL_PASSWORD=$\'' + mysqlPassword + '\'' +
                            ' -e DATA_APP_CONTAINER_PORT=1111 ' +
                            ' -p 80:1111 -d ' + dockerImageName +
                            ' > /dev/null 2>&1';
                        utility.sshExecCmd(vmInfo.address, vmInfo.username, vmInfo.keyfilename, vmInfo.key, dockercmd, { verbose: false, sshPrintCommands: true }, function (err) {
                            if (err) return cb(err);
                            else return cb();
                        });
                    });
            }
            else {
                console.error('invalid os type: ' + vmInfo.os);
                return cb('invalid os type: ' + vmInfo.os);
            }
        }, function (err) {
            if (err) {
                console.error('deploy test app failed..' + err);
                return callback(err);
            } else {
                console.log('deploy test app done. \n');
                return callback();
            }
        });
}

// deploy test client to ubuntu system, not windows. 
// 1. install jmeter
// 2. copy testplan
function deployTestClient(vmAddress, userName, keyFileName, key, callback) {
    var cmds = 'sudo apt-get update && sudo apt-get install -y openjdk-8-jdk && ' +
        ' wget -c http://www-us.apache.org/dist//jmeter/binaries/apache-jmeter-3.2.tgz && ' +
        ' tar -xzf apache-jmeter-3.2.tgz && ' +
        ' cd ./apache-jmeter-3.2';

    console.log('deploying test client to : ' + vmAddress);
    utility.sshExecCmd(vmAddress, userName, keyFileName, key, cmds, { verbose: false, sshPrintCommands: true },
        function (err) {
            if (err) {
                console.error(err);
            }
            return callback(err);
        });
}

// endpointInfo
// { endpoint: 'testendpoint', targettestplan:'targettestplanname', scenarioname: 'scenarioname' }
function customizeTestPlans(sampletestplan, testInfos, threadnum, loopcount, rampupseconds, testfile, logfile) {
    if (!fs.existsSync(sampletestplan)) {
        return console.error('sample test plan file not exists ' + sampletestplan);
    }


    // generate test plan for each of endpoint
    for (var testInfo of testInfos) {
        var endpoint = testInfo.endpoint;
        var targettestplan = testInfo.targettestplan;
        var scenarioName = testInfo.scenarioname;

        var content = fsExtra.readFileSync(sampletestplan, 'utf8');
        var doc = new dom().parseFromString(content, 'application/xml');

        //customize log file
        var logfileNode = select(doc, '//stringProp[@name="filename"]');
        logfileNode[0].textContent = logfile;

        // customize endpoints
        var endpointNodes = select(doc, '//stringProp[@name="HTTPSampler.domain"]');
        for (var j = 0; j < endpointNodes.length; j++) {
            endpointNodes[j].textContent = endpoint;
        }

        // customize # of threads
        var threadNumNode = select(doc, '//stringProp[@name="ThreadGroup.num_threads"]');
        threadNumNode.textContent = threadnum;

        // customize loopcount
        var loopNode = select(doc, '//stringProp[@name="LoopController.loops"]');
        loopNode.textContent = loopcount;

        // customize rampup seconds
        var rampupNode = select(doc, '//stringProp[@name="ThreadGroup.ramp_time"]');
        rampupNode.textContent = rampupseconds;

        // customize scenario names
        // mark test metrics into scenario names
        // e.g. azure_westus_vm_standard_a1_ubuntu_500_1_5
        var threadGroup = select(doc, '//ThreadGroup[@testclass="ThreadGroup"]/@testname');
        threadGroup.textContent = scenarioName;


        // customize test file for file upload scenario
        var fileNode = select(doc, '//stringProp[@name="File.path"]');
        fileNode.textContent = testfile;

        var eleFileNode = select(doc, '//elementProp[@elementType="HTTPFileArg"]/@name');
        eleFileNode.textContent = testfile;

        // save updated test plan
        var newDoc = new serializer().serializeToString(doc);
        fs.writeFileSync(targettestplan, newDoc);
    }
}

function runTest(clientAddress, userName, keyFileName, key, testplanfiles, logfile, locallogfile, callback) {
    console.log('running test against ' + clientAddress + '...\n');
    console.log('local log file: ' + locallogfile);

    // run multiple test plans one by one
    async.each(testplanfiles,
        function (testplanfile, cb) {
            var cmds = 'cd ~/apache-jmeter-3.2/bin && ./jmeter.sh -n -t ' + testplanfile + ' -l ' + logfile;
            utility.sshExecCmd(clientAddress, userName, keyFileName, key, cmds, { verbose: true, sshPrintCommands: true }, function (err) {
                if (err) {
                    console.error(err);
                    return cb(err);
                } else {
                    console.log('test plan ' + testplanfile + ' done...');
                    return cb();
                }
            })
        }, function (err) {
            if (err) {
                console.error('test execution error: \n ' + err);
                return callback(err);
            } else {
                console.log('all test execution done!');
                // download test results
                utility.downloadFilesViaScp([logfile],
                    [locallogfile],
                    clientAddress, userName, keyFileName, key, function (err) {
                        if (err) console.error('download test result failed');
                        return callback(err);
                    });
            }
        }
    )
}

exports.createAzureResource = createAzureResource;
exports.deployTestAppToVM = deployTestAppToVM;
exports.deployTestClient = deployTestClient;
exports.customizeTestPlans = customizeTestPlans;
exports.runTest = runTest;