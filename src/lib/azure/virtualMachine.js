'use strict'

const ComputeManagementClient = require("azure-arm-compute");
const ResourceManagementClient = require("azure-arm-resource").ResourceManagementClient;
const StorageManagementClient = require("azure-arm-storage");
const NetworkManagementClient = require("azure-arm-network");
const msRestAzure = require("ms-rest-azure");
const storage = require("azure-storage");

const fs = require("fs");
const path = require('path');
//const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..\\azure', 'config.json'), 'utf8'));
const vmImageConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..\\azure', 'vmImageConfig.json'), 'utf8'));
const utils = require('../utils.js');
const resourcegroup = require('./resourcegroup.js');

var credentials, resourceClient, computeClient, networkClient, storageClient;

function initialClient(clientId, tenantId, key, subscriptionId) {
    if (typeof credentials === undefined || credentials === '' || credentials === null || credentials === undefined) {
        credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenantId, key);
        resourceClient = new ResourceManagementClient(credentials, subscriptionId);
        computeClient = new ComputeManagementClient(credentials, subscriptionId);
        networkClient = new NetworkManagementClient(credentials, subscriptionId);
        storageClient = new StorageManagementClient(credentials, subscriptionId);
    }
}

function getVirutalMachine(clientId, tenantId, key, subscriptionId, resourceGroupName, vmName, callback) {
    initialClient(clientId, tenantId, key, subscriptionId);

    computeClient.virtualMachines.get(resourceGroupName, vmName, null, function (err, result) {
        if (err) {
            if (err.statusCode === 404) {
                // not found vm
                // return null
                return callback(null, null);
            } else {
                // other get error, return callback
                console.error(err);
                return callback(err, result);
            }
        }

        if (typeof result === 'undefined' || result === '' || result === null) {
            return console.log(`vm ${vmName} not found in resource group ${resourceGroupName}`);
        }

        console.log(`found VM: ` + JSON.stringify(result));
        return callback(err, results);
    });
}

// location is like : west us
// vmSize is like : Standard_A1, Standard_D2_v2, Standard_DS14_v2. detail https://docs.microsoft.com/en-us/azure/virtual-machines/windows/sizes-general
function createOrGetVirtualMachine(
    clientId,
    tenantId,
    key,
    subscriptionId,
    resourceGroupName,
    vmName,
    location,
    vmSize,
    osType,
    userName,
    password,
    callback) {
    initialClient(clientId, tenantId, key, subscriptionId);

    var storageAccountName = resourceGroupName + location.replace(' ', '') + 'disk';
    var vnetName = resourceGroupName + '-' + location.replace(' ', '') + '-vnet';
    var publicIPName = vmName + '-ip';
    var networkInterfaceName = vmName + '-nic';
    var domainLableName = 'testdomain' + utils.generateRandomId('');
    var nsgName = vmName + '-nsg';

    if (osType !== 'windows' && osType !== 'ubuntu') {
        console.error('invalid osType' + osType);
        return callback('invalid osType' + osType, null);
    }

    var publisher = vmImageConfig[osType].publisher;
    var offer = vmImageConfig[osType].offer;
    var sku = vmImageConfig[osType].sku;

    resourcegroup.createOrGetResourceGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, location, 'test', function (err, rg) {
        if (err) return callback(err);
        createStorageAccount(clientId, tenantId, key, subscriptionId, resourceGroupName, storageAccountName, location, 'Standard_LRS', osType, function (err, storageAccount) {
            if (err) return callback(err);
            createPublicIP(clientId, tenantId, key, subscriptionId, resourceGroupName, publicIPName, location, domainLableName, function (err, publicIPInfo) {                
                if (err) return callback(err);
                createVNet(clientId, tenantId, key, subscriptionId, resourceGroupName, vnetName, location, function (err, vnetInfo) {
                    if (err) return callback(err);
                    getSubnetInfo(clientId, tenantId, key, subscriptionId, resourceGroupName, vnetInfo.name, vnetInfo.subnets[0].name, function (err, subnetInfo) {
                        if (err) return callback(err);
                        createNetworkSecurityGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, location, nsgName, function (err, nsgInfo) {
                            if (err) return callback(err);
                            createNIC(clientId, tenantId, key, subscriptionId, resourceGroupName, networkInterfaceName, location, subnetInfo, publicIPInfo, nsgInfo, function (err, nicInfo) {
                                if (err) return callback(err);
                                findVMImage(clientId, tenantId, key, subscriptionId, location.replace(' ', ''), publisher, offer, sku, function (err, vmImageInfo) {
                                    if (err) return callback(err);
                                    getPublicIP(clientId, tenantId, key, subscriptionId, resourceGroupName, publicIPName, function (err, publicIPAddr) {
                                        if (err) return callback(err);
                                        //console.log('getpublicIP: ' + JSON.stringify(publicIPAddr));
                                        var address = publicIPAddr.ipAddress;
                                        if (address === '' || address === undefined) {
                                            address = publicIPAddr.dnsSettings.fqdn;
                                        }
                                        createVirtualMachines(clientId, tenantId, key, subscriptionId, resourceGroupName, vmName, location.replace(' ', ''), vmSize, storageAccountName, nicInfo.id,
                                            publisher, offer, sku, '', vmImageInfo[0].name, userName, password, function (err, vmInfo) {
                                                if (err) return callback(err);
                                                console.log(`creating vm ${vmInfo.name} with address ${address} succssfully!`);
                                                return callback(null, address);
                                            });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function createResourceGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, location, callback) {
    var params = { location: location };

    initialClient(clientId, tenantId, key, subscriptionId);
    return resourceClient.resourceGroups.createOrUpdate(resourceGroupName, params, callback);
}

function createStorageAccount(clientId, tenantId, key, subscriptionId, resourceGroupName, name, location, type, osType, callback) {
    console.log(`creating storage account ${name}`);
    var accountParameters = {
        location: location,
        sku: {
            name: 'Standard_LRS'
        },
        kind: 'Storage'
    };
    // 1. create storage account
    initialClient(clientId, tenantId, key, subscriptionId);

    storageClient.storageAccounts.create(resourceGroupName, name, accountParameters, function (err, result) {
        if (err) {
            console.error(err);
            return callback(err, data);
        } else {
            if (osType === 'windows') {
                var containerName = 'baseimages';
                var blobName = 'baseimage.vhd';

                // 2. upload customized windows image to the storage account
                storageClient.storageAccounts.listKeys(resourceGroupName, name, null, function (err, data) {
                    if (err) return callback(err, data);

                    var key = data.keys[0].value;
                    var storageSvc = storage.createBlobService(name, key);

                    storageSvc.createContainerIfNotExists(containerName, { publicAccessLevel: 'blob' }, function (err, result) {
                        if (err) return callback(err, result);
                        // check if storage contains customized base image already
                        storageSvc.getBlobMetadata(containerName, blobName, null, function (err, result) {
                            if (err) {
                                // if not exists, start uploading
                                console.log('uploading customized windows base image to azure storage, it will take a while given size over 100 G....');
                                storageSvc.createBlockBlobFromLocalFile(containerName, blobName, vmImageConfig.windows.localBaseImage, '', function (err, result) {
                                    if (err) return callback(err, result);
                                    console.log('base image prepartion done : ' + JSON.stringify(result));
                                    return callback(err, result);
                                })
                            } else {
                                // customized base image already exits, quit
                                console.log('customized base image is already there, return ' + JSON.stringify(result));
                                return callback(err, result);
                            }
                        });
                    });
                });
            }
        }
        return callback(err, result);
    });
}

function createVNet(clientId, tenantId, key, subscriptionId, resourceGroupName, name, location, callback) {
    console.log(`creating VNet ${name}`);
    var vnetParameters = {
        location: location,
        addressSpace: {
            addressPrefixes: ['10.0.0.0/16']
        },
        subnets: [{ name: name, addressPrefix: '10.0.0.0/24' }]
    };

    initialClient(clientId, tenantId, key, subscriptionId);
    return networkClient.virtualNetworks.createOrUpdate(resourceGroupName, name, vnetParameters, callback);
}

function getSubnetInfo(clientId, tenantId, key, subscriptionId, resourceGroupName, vnetName, subnetName, callback) {
    console.log(`getting subnet ${subnetName}`);

    initialClient(clientId, tenantId, key, subscriptionId);
    return networkClient.subnets.get(resourceGroupName, vnetName, subnetName, callback);
}

function createPublicIP(clientId, tenantId, key, subscriptionId, resourceGroupName, publicIPName, location, domainNameLabel, callback) {
    console.log(`creating publicIP ${publicIPName}`);
    var publicIPParameters = {
        location: location,
        publicIPAllocationMethod: 'Dynamic',
        dnsSettings: {
            domainNameLabel: domainNameLabel
        }
    };

    initialClient(clientId, tenantId, key, subscriptionId);
    networkClient.publicIPAddresses.createOrUpdate(resourceGroupName, publicIPName, publicIPParameters, function (err, publicIPInfo) {
        if (err) {
            console.error(err);
            return callback(err, null);
        } else {
            // publicIP provision need some time
            utils.sleep(60000);
            return callback(err, publicIPInfo);
        }
    });
    //return networkClient.publicIPAddresses.createOrUpdate(resourceGroupName, publicIPName, publicIPParameters, callback);
}

function getPublicIP(clientId, tenantId, key, subscriptionId, resourceGroupName, publicIPName, callback) {
    console.log(`getting publicIP ${publicIPName}`);
    initialClient(clientId, tenantId, key, subscriptionId);
    return networkClient.publicIPAddresses.get(resourceGroupName, publicIPName, '', callback);
}

function createNIC(clientId, tenantId, key, subscriptionId, resourceGroupName, networkInterfaceName, location, subnetInfo, publicIPInfo, nsgInfo, callback) {
    console.log(`creating NIC ${networkInterfaceName}`);
    var nicParameters = {
        location: location,
        ipConfigurations: [
            {
                name: networkInterfaceName,
                privateIPAllocationMethod: 'Dynamic',
                subnet: subnetInfo,
                publicIPAddress: publicIPInfo
            }
        ],
        networkSecurityGroup: {
            id: nsgInfo.id
        }
    };

    initialClient(clientId, tenantId, key, subscriptionId);
    return networkClient.networkInterfaces.createOrUpdate(resourceGroupName, networkInterfaceName, nicParameters, callback);
}

function createNetworkSecurityGroup(clientId, tenantId, key, subscriptionId, resourceGroupName, location, nsgName, callback) {
    console.log(`creating NSG ${nsgName}`);
    var nsgParameters = {
        location: location,
        securityRules: [
            {
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '80',
                access: 'Allow',
                direction: 'Inbound',
                name: 'tcp80',
                priority: 108,
                sourceAddressPrefix: '*',
                destinationAddressPrefix: '*'
            },
            {
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '22',
                access: 'Allow',
                direction: 'Inbound',
                name: 'ssh',
                priority: 321,
                sourceAddressPrefix: '*',
                destinationAddressPrefix: '*'
            }
        ]
    };

    initialClient(clientId, tenantId, key, subscriptionId);
    return networkClient.networkSecurityGroups.createOrUpdate(resourceGroupName, nsgName, nsgParameters, null, callback);
}

function findVMImage(clientId, tenantId, key, subscriptionId, location, publisher, offer, sku, callback) {
    console.log(`finding VMImage ${offer}`);

    initialClient(clientId, tenantId, key, subscriptionId);
    return computeClient.virtualMachineImages.list(location, publisher, offer, sku, { top: 1 }, callback);
}

function createVirtualMachines(
    clientId,
    tenantId,
    key,
    subscriptionId,
    resourceGroupName,
    vmName,
    location,
    vmSize,
    storageAccountName,
    nicId,
    publisher,
    offer,
    sku,
    imageUri,
    vmImageVersionNumber,
    userName,
    password,
    callback) {
    const vmParameters = {
        location: location,
        osProfile: {
            computerName: vmName,
            adminUsername: userName,
            adminPassword: password
        },
        hardwareProfile: {
            vmSize: vmSize
        },
        storageProfile: {
            osDisk: {
                name: vmName,
                caching: 'None',
                createOption: 'fromImage',
                //sourceImageUri: '',
                vhd: { uri: 'https://' + storageAccountName + '.blob.core.windows.net/vmhds/' + vmName + '.vhd' }
            },
        },
        networkProfile: {
            networkInterfaces: [
                {
                    id: nicId,
                    primary: true
                }
            ]
        }
    };

    if (imageUri) {
        vmParameters.storageProfile.osDisk.sourceImageUri = imageUri;
        vmParameters.storageProfile.osDisk.osType = 'Windows';
    } else {
        vmParameters.storageProfile.imageReference = {
            publisher: publisher,
            offer: offer,
            sku: sku,
            version: vmImageVersionNumber
        };
    }
    console.log(`creating VM ${vmName}`);

    initialClient(clientId, tenantId, key, subscriptionId);
    return computeClient.virtualMachines.createOrUpdate(resourceGroupName, vmName, vmParameters, callback);
}

function powerOffVM(clientId, tenantId, key, subscriptionId, resourceGroupName, vmName, callback) {
    initialClient(clientId, tenantId, key, subscriptionId);
    computeClient.virtualMachines.powerOff(resourceGroupName, vmName, function (err, result) {
        if (err) {
            console.error(err);
            return callback(err, result);
        } else {
            console.log(`azure vm ${vmName} in resourceGroup ${resourceGroupName} powerring off successfully`);
            return callback(err, result);
        }
    });
}

function deleteVM(clientId, tenantId, key, subscriptionId, resourceGroupName, vmName, callback) {
    initialClient(clientId, tenantId, key, subscriptionId);
    computeClient.virtualMachines.deleteMethod(resourceGroupName, vmName, function (err, result) {
        if (err) {
            console.error(err);
            return callback(err, result);
        } else {
            console.log(`azure vm ${vmName} in resourceGroup ${resourceGroupName} deleting successfully`);
            return callback(err, result);
        }
    });
}

function startVM(clientId, tenantId, key, subscriptionId, resourceGroupName, vmName, callback) {
    initialClient(clientId, tenantId, key, subscriptionId);
    computeClient.virtualMachines.start(resourceGroupName, vmName, function (err, result) {
        if (err) {
            console.error(err);
            return callback(err, result);
        } else {
            console.log(`azure vm ${vmName} in resourceGroup ${resourceGroupName} starting successfully`);
            return callback(err, result);
        }
    });
}

function finalCallback(err, result) {
    if (err) return console.error(err);
}

exports.createOrGetVirtualMachine = createOrGetVirtualMachine;
exports.createStorageAccount = createStorageAccount;
exports.startVM = startVM;
exports.powerOffVM = powerOffVM;
exports.deleteVM = deleteVM;