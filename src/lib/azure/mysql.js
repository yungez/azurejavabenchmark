'use strict';

const fs = require('fs');
const path = require('path');
const msRestAzure = require('ms-rest-azure');
const utility = require('../utils.js');
const ResourceManagementClient = require('azure-arm-resource').ResourceManagementClient;

var credentials, resourceClient;

function initialClient(clientId, tenantId, key, subscriptionId) {
    if (typeof resourceClient === undefined || resourceClient === '' || resourceClient === null || resourceClient === undefined) {
        credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenantId, key);
        resourceClient = new ResourceManagementClient(credentials, subscriptionId);
    }
}

function createMySql(clientId, tenantId, key, subsId, resourceGroupName, region, dbname, username, password, priceTier, capacity, size, callback) {
    initialClient(clientId, tenantId, key, subsId);

    return loadTemplateAndDeploy(resourceGroupName, region, dbname, username, password, priceTier, capacity, size, callback);
}

function loadTemplateAndDeploy(resourceGroupName, region, dbname, username, password, priceTier, capacity, size, callback) {
    var deploymentName = 'deployment' + utility.generateRandomId();

    try {
        var templateFilePath = path.join(__dirname, "template/mysqltemplate.json");
        var template = JSON.parse(fs.readFileSync(templateFilePath, 'utf8'));
    } catch (ex) {
        return callback(ex);
    }

    var parameters = {
        "administratorLogin": {
            "value": username
        },
        "administratorLoginPassword": {
            "value": password
        },
        "location": {
            "value": region
        },
        "serverName": {
            "value": dbname
        },
        "tier": {
            "value": priceTier
        },
        "capacity": {
            "value": capacity
        },
        "size": {
            "value": size
        }
    };
    var deploymentParameters = {
        "properties": {
            "parameters": parameters,
            "template": template,
            "mode": "Incremental"
        }
    };

    console.log('creating mysql deployment..');
    return resourceClient.deployments.createOrUpdate(resourceGroupName,
        deploymentName,
        deploymentParameters,
        function (err, result) {
            if (err) {
                console.error(err);
                return callback(err, result);
            } else {
                var server = { name: dbname + '.mysql.database.azure.com', username: username + '@' + dbname, password: password };
                console.log('creating mysql ' + server.name + ' successfully!\n');
                return callback(err, server);
            }
        });
}

function prepareData() {
    
}

exports.createMySql = createMySql;