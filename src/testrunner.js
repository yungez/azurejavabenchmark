'use strict'

const fs = require('fs');
const path = require('path');
const deploy = require('./deploy.js');
const testConfig = JSON.parse(fs.readFileSync('./testConfig.json', 'utf8'));
const utility = require('./lib/utils.js');
const testresult = require('./testresult.js');
const async = require('async');

var testclient = {}
const seperator = '================================';

const argv = require('yargs').argv;
if (argv.length < 4) {
    help();
    return 0;
}

var clientId = argv.clientid;
var tenantId = argv.tenantid;
var key = argv.key;
var subsId = argv.subsid;

// step 1. create test resources
console.log(seperator + '\nStep 1. creating azure test resources...\n');
deploy.createAzureResource(clientId, tenantId, key, subsId, testConfig.azure.resources, function (err, resources) {
    if (err) {
        console.log(err);
        return 1;
    }

    // 2. deploy test app to resources
    var vmInfos = [];
    var mySqlServer = '';
    for (var item of resources) {
        if (item.type === 'vm') {
            vmInfos.push({ address: item.address, username: item.username, key: item.key, os: item.os });
        } else if (item.type === 'mysql') {
            mySqlServer = item;
        }
    }

    console.log(seperator + '\nStep 2. deploying test app to azure test resources...\n');
    deploy.deployTestAppToVM(vmInfos, testConfig.azure.testapp.dockerimage, mySqlServer.address, mySqlServer.username, mySqlServer.password, function (err) {
        if (err) {
            console.log('deployTestAppToVM err: \n' + err);
            return 1;
        }
        // 3. create test client
        console.log(seperator + '\nStep 3. creating azure test client...\n');
        deploy.createAzureResource(clientId, tenantId, key, subsId, [testConfig.azure.client], function (err, clients) {
            if (err) {
                console.log('createAzureResource err: \n' + err);
                return 1;
            }

            // 4. deploy test client
            console.log('testclients: ' + JSON.stringify(clients));
            console.log(seperator + '\nStep 4. deploying test client...\n');
            deploy.deployTestClient(clients[0].address, testConfig.azure.client.username, null, testConfig.azure.client.password, function (err, result) {
                console.log('test client: \n' + JSON.stringify(clients));

                if (err) {
                    console.log(err);
                    return 1;
                }

                // 5. customize test plan                
                var localtestplans = [];
                var remotetestplans = [];
                var testresources = [];
                var testplanInfos = [];

                var homefolder = '/home/' + clients[0].username + '/';
                var remotetestplanfile = homefolder + '/azuretestplan.jmx';
                var remotelogfile = homefolder + '/azuretestresult.csv';
                var remotetestfile = homefolder + '/azuretestfile.jpg';

                for (var resource of resources) {
                    if (resource.type === 'vm' || resource.type === 'webapp') {
                        testresources.push(resource);
                    }
                }

                for (var testtarget of testresources) {

                    var localtestplan = path.dirname(testConfig.azure.testplan.sampletestplan) + '\\azuretestplan' + utility.generateRandomId(100) + '.jmx';
                    var remotetestplan = homefolder + '/' + path.basename(localtestplan);

                    localtestplans.push(localtestplan);
                    remotetestplans.push(remotetestplan);

                    // e.g. azure_westus_vm_standard_a1_ubuntu_500_1_5z
                    var info = ['azure', testtarget.region.replace(' ', ''), testtarget.type, testtarget.size,
                        testConfig.azure.testplan.threadnum, testConfig.azure.testplan.loopcount, testConfig.azure.testplan.rampupseconds];

                    testplanInfos.push({ endpoint: testtarget.address, targettestplan: localtestplan, scenarioname: info });
                }


                console.log(seperator + '\nStep 5. customzing test plan based on configuration...\n');
                deploy.customizeTestPlans(testConfig.azure.testplan.sampletestplan,
                    testplanInfos,
                    testConfig.azure.testplan.threadnum,
                    testConfig.azure.testplan.loopcount,
                    testConfig.azure.testplan.rampupseconds,
                    remotetestfile,
                    remotelogfile);

                // 6. copy test plan and test file to remote test client                    
                console.log(seperator + '\nStep 6. uploading test plan to client ' + clients[0].address + '...\n');
                utility.uploadFilesViaScp(
                    localtestplans.concat(testConfig.azure.testplan.testfile),
                    remotetestplans.concat(remotetestfile),
                    clients[0].address,
                    clients[0].username,
                    '',
                    clients[0].key,
                    function (err, result) {
                        if (err) {
                            console.log(err);
                            return 1;
                        }

                        console.log('azure test env preparation done.');

                        var locallogfile = testConfig.azure.testplan.localtestresultsfolder + '\\azuretestresult.csv';
                        var output = {};
                        output.clientAddress = clients[0].address;
                        output.remotelogfile = remotelogfile;
                        output.remotetestplans = remotetestplans;
                        output.remoteuser = clients[0].username;
                        output.remotekey = clients[0].key;
                        output.locallogfile = locallogfile;
                        //return callback(null, output);

                        // 7. run test
                        console.log(seperator + '\nStep 7. run test...\n');
                        deploy.runTest(
                            output.clientAddress,
                            output.remoteuser,
                            '',
                            output.remotekey,
                            output.remotetestplans,
                            output.remotelogfile,
                            output.locallogfile,
                            function (err, result) {
                                if (err) {
                                    console.error('test run error: \n' + err);
                                    return 1;
                                } else {
                                    // parse test result
                                    //console.log(seperator + '\nStep 8. parse test result...\n');
                                    //testresult.parseJMeterTestResult(output.locallogfile, output.locallogfile + '.updated');
                                    // return csv directly
                                    console.log('test log file: ' + output.locallogfile);
                                    return 0;
                                }
                            });
                    });
            });
        });
    });
});


function usage() {
    var usage = 'Uasge: \n' +
        'testrunner --clientId 123 --tenantId 123 --key 123 --subsId 123';
    console.log(usage);
}
