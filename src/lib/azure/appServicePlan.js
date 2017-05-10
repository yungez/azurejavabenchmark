'use strict'

const azureArmWebsite = require("azure-arm-website");
const msRestAzure = require("ms-rest-azure");
const fs = require("fs");
const path = require('path');
//const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..\\azure', 'config.json'), 'utf8'));

var webSiteManagementClient = '';

function initialClient(clientId, tenantId, key, subscriptionId) {
    if (typeof webSiteManagementClient === undefined || webSiteManagementClient === '' || webSiteManagementClient === null) {
        var credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenantId, key);
        webSiteManagementClient = new azureArmWebsite(credentials, subscriptionId);
    }
}

function createOrGetAppServicePlan(clientId, tenantId, key, subsId, location, skuName, resourceGroupName, callback) {
    initialClient(clientId, tenantId, key, subsId);

    var appServicePlanName = (location + '_' + skuName).replace(' ', '_');

    webSiteManagementClient.appServicePlans.get(
        resourceGroupName,
        appServicePlanName,
        null,
        function (err, appserviceplan) {
            if (err) {
                if (err.statusCode === 404) {
                    // not found
                    // create one
                    // app service plan: https://azure.microsoft.com/en-us/pricing/details/app-service/
                    // skuName available value: B1/B2/B3, S1/S2/S3, P1/P2/P3/P4
                    var appServicePlanDetail = {
                        appServicePlanName: appServicePlanName,
                        sku: {
                            name: skuName,
                            tier: skuName,
                            size: '1'
                        },
                        location: location
                    }

                    webSiteManagementClient.appServicePlans.createOrUpdate(
                        resourceGroupName,
                        appServicePlanName,
                        appServicePlanDetail,
                        function (err, result) {
                            if (err) {
                                console.error(err);
                            } else {
                                console.log(`appServicePlan ${appServicePlanName} created in resource group ${resourceGroupName}`);
                            }
                            return callback(err, result);
                        }
                    )
                    // cretion done
                } else {
                    // other get error, callback
                    return callback(err, appserviceplan);
                }
            } else {
                // get exists, directly callback result
                return callback(err, appserviceplan);
            }
        })
}

exports.createOrGetAppServicePlan = createOrGetAppServicePlan;