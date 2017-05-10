'use strict'

// azure resources
const azureWebApp = require('./azure/webApp.js');
const azureVM = require('./azure/virtualMachine.js');

var resource = {};

// azure
// 1. webApp
resource.createOrGetAzureWebApp = function (clientId, tenantId, key, subsId, resourceGroupName, name, region, skuName, callback) {
    return azureWebApp.createOrGetWebApp(clientId, tenantId, key, subsId, resourceGroupName, name, region, skuName, null, callback);
}

resource.startAzureWebApp = function (clientId, tenantId, key, subsId, resourceGroupName, name, callback) {
    return azureWebApp.startWebApp(clientId, tenantId, key, subsId, resourceGroupName, name, callback);
}

resource.stopAzureWebApp = function (clientId, tenantId, key, subsId, resourceGroupName, name, callback) {
    return azureWebApp.stopWebApp(clientId, tenantId, key, subsId, resourceGroupName, name, callback);
}

resource.deleteAzureWebApp = function (clientId, tenantId, key, subsId, resourceGroupName, name, callback) {
    return azureWebApp.deleteWebApp(clientId, tenantId, key, subsId, resourceGroupName, name, callback);
}

// 2. vm
resource.createOrGetAzureVM = function (clientId, tenantId, key, subsId, resourceGroupName, vmName, region, size, osType, userName, password, callback) {
    return azureVM.createOrGetVirtualMachine(clientId, tenantId, key, subsId, resourceGroupName, vmName, region, size, osType, userName, password, callback);
}

resource.startAzureVM = function (clientId, tenantId, key, subsId, resourceGroupName, vmName, callback) {
    return azureVM.startVM(clientId, tenantId, key, subsId, resourceGroupName, vmName, callback);
}

resource.stopAzureVM = function (clientId, tenantId, key, subsId, resourceGroupName, vmName, callback) {
    return azureVM.powerOffVM(clientId, tenantId, key, subsId, resourceGroupName, vmName, callback);
}

resource.deleteAzureVM = function (clientId, tenantId, key, subsId, resourceGroupName, vmName, callback) {
    return azureVM.deleteVM(clientId, tenantId, key, subsId, resourceGroupName, vmName, callback);
}

module.exports = resource;