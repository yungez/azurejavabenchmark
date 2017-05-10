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
    var resourceAddresses = [];
    for (var item of resources) {
        resourceAddresses.push(item.address);
        if (item.type === 'vm') {
            vmInfos.push({ address: item.address, username: item.username, key: item.key, os: item.os });
        }
    }

    console.log(seperator + '\nStep 2. deploying test app to azure test resources...\n');
    deploy.deployTestAppToVM(vmInfos, testConfig.azure.testapp.dockerimage, function (err) {
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
            var clientAddress = [];
            for (var item of clients) {
                clientAddress.push(item.address);
            }
            console.log(seperator + '\nStep 4. deploying test client...\n');
            deploy.deployTestClient(clientAddress[0], testConfig.azure.client.username, null, testConfig.azure.client.password, function (err, result) {
                console.log('test client: \n' + JSON.stringify(clients));

                if (err) {
                    console.log(err);
                    return 1;
                }

                // 5. customize test plan
                var homefolder = '/home/' + clients[0].username + '/';
                var localtestplan = path.dirname(testConfig.azure.testplan.sampletestplan) + '\\azuretestplan.jmx';
                var remotetestplanfile = homefolder + '/azuretestplan.jmx';
                var remotelogfile = homefolder + '/azuretestresult.csv';
                var remotetestfile = homefolder + '/azuretestfile.jpg';
                var scenarioNames = [];
                for (var target of testConfig.azure.resources) {
                    // e.g. azure_westus_vm_standard_a1_ubuntu_500_1_5
                    var info = ['azure', target.region.replace(' ', ''), target.type, target.size.replace(new RegExp('_', 'g'), ''),
                        testConfig.azure.testplan.threadnum, testConfig.azure.testplan.loopcount, testConfig.azure.testplan.rampupseconds];
                    scenarioNames.push(info.join('_'));
                }

                console.log(seperator + '\nStep 5. customzing test plan based on configuration...\n');
                deploy.customizeTestPlan(testConfig.azure.testplan.sampletestplan,
                    localtestplan,
                    resourceAddresses,
                    testConfig.azure.testplan.threadnum,
                    testConfig.azure.testplan.loopcount,
                    testConfig.azure.testplan.rampupseconds,
                    remotetestfile,
                    remotelogfile,
                    scenarioNames);

                // 6. copy test plan and test file to remote test client                    
                console.log(seperator + '\nStep 6. uploading test plan to client ' + clientAddress[0] + '...\n');
                utility.uploadFilesViaScp(
                    [localtestplan, testConfig.azure.testplan.testfile],
                    [remotetestplanfile, remotetestfile],
                    clientAddress[0],
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
                        output.clientAddress = clientAddress[0];
                        output.remotelogfile = remotelogfile;
                        output.remotetestplan = remotetestplanfile;
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
                            output.remotetestplan,
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
