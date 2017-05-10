'use strict'

const ResourceManagementClient = require('azure-arm-resource').ResourceManagementClient;
const msRestAzure = require("ms-rest-azure");
const fs = require("fs");
const path = require('path');
//const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..\\azure', 'config.json'), 'utf8'));
var resourceClient;

function initialClient(clientId, tenantId, key, subscriptionId) {
    if (typeof resourceClient === undefined || resourceClient === '' || resourceClient === null || resourceClient === undefined) {
        var credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenantId, key);
        resourceClient = new ResourceManagementClient(credentials, subscriptionId);
    }
}

function getResourceGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, callback) {
    initialClient(clientId, tenantId, key, subscriptionId);

    resourceClient.resourceGroups.get(resourceGroupName, null, function (err, result) {
        if (err) {
            if (err.statusCode === 404) {
                console.log(`resourceGroup ${resourceGroupName} not found in subs ${subscriptionId}`);
                return callback(null, null);
            } else {
                console.error(err);
                return callback(err, result);
            }
        }

        console.log(`resourceGroup ${resourceGroupName} found in subs ${subscriptionId}`);
        return callback(null, result);
    })

}

function createResourceGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, location, tag, callback) {
    initialClient(clientId, tenantId, key, subscriptionId);

    if (resourceGroupName === null) {
        console.error(`resourceGroupName cannot be null`);
        return;
    }

    var groupParameters = {
        location: location,
        tags: {
            tag
        }
    };

    resourceClient.resourceGroups.createOrUpdate(resourceGroupName, groupParameters, null, function (err, result) {
        if (err) {
            return console.error(err);
        }

        if (result === 'undefined') {
            console.log(`resourceGroup ${resourceGroupName} not created in subs ${subscriptionId}`);
            return null;
        }

        console.log(`resourceGroup ${resourceGroupName} was created in subs ${subscriptionId}`);
        return callback(err, result);
    });
}

function createOrGetResourceGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, location, tag, callback) {
    initialClient(clientId, tenantId, key, subscriptionId);

    getResourceGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, function (err, result) {
        if (err) {
            console.error(err);
            return callback(err, result)
        } else if (result === null) {
            // not exists, create one
            var groupParameters = {
                location: location,
                tags: {
                    tag
                }
            };

            resourceClient.resourceGroups.createOrUpdate(resourceGroupName, groupParameters, null, function (err, result) {
                if (err) {
                    console.error(err);
                    return callback(err, result);
                }

                console.log(`resourceGroup ${resourceGroupName} was created in subs ${subscriptionId}`);
                return callback(err, result);
            });
        } else {
            // exists, return get result directly
            return callback(err, result);
        }
    })
}

exports.getResourceGroup = getResourceGroup;
exports.createOrGetResourceGroup = createOrGetResourceGroup;