# overview
azure java benchmark tool is tool to run java benchmark test against azure services.

# functionality
With test configuration, test will do:
1. create azure test resources, e.g vm or webapp with specified region, size, osType, credential from configuration.
2. deploy test app wrapped in docker container to resources created in step 1.
3. create test client, which is ubuntu vm in azure, user could specify region, size, credential for the vm.
4. deploy JMeter test tool to test client.
5. customize JMeter test plan based on user configuratin, eg. thread number, loop count, ramp up seconds. set test endpoints to be services created in step 1.
6. upload customized test plan in step 5 to test client created in step 3.
7. run JMeter tests based on test plan on test client, against test services endpoints created in step 1.
8. download test result csv file to local path specified in test configuration.

#usage

1. specify test configuration in testConfig.json
    - azure.client is configuration for test client
    - azure.resources is configuration for test target resources, supporting vm and webapp    
    - azure.testplan is configuration for test plan
    - azure.testapp is docker image info of test app

2. supported values of configuration:
    - os: ubuntu/windows
    - size, for vm, eg. 'Standard_A4', 'Standard_A5', 'Standard_A6', 'Standard_A7', 'Standard_A8',. pls refer to ['vmsize' (./lib/azure/vmtemplate.md)]
    - size, for web app, eg. B1/B2/B3, S1/S2/S3, P1/P2/P3/P4 pls refer to https://azure.microsoft.com/en-us/pricing/details/app-service/
    - region: azure support regions. e.g. west us, east us.


3. run below command

```
cd src && npm install
cd lib && npm install
node testrunner --clientid xxxxxxxx-25d3-4005-a08f-xxxxxxxxxxxx --tenantid xxxxxxxx-bc4d-4751-849e-xxxxxxxxxxxx --key e0uN/NolEF5vTiX2zegYUtfNehXDakjsFjen0VDrHjw= --subsid xxxxxxxx-6207-4501-96e3-xxxxxxxxxxxx
```




