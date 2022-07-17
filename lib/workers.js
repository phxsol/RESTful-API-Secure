/*
 *  worker subroutines
 *
 */

// Dependencies
let path = require('path');
let fs = require('fs');
let https = require('https');
let http = require('http');
let url = require('url');
let helpers = require('./helpers');
let _data = require('./data');
let config = require('./config');
let util = require('util');
let debug = util.debuglog('workers');

// Instantiate the worker object
let workers = {};

// Initialization Script
workers.init = ()=>{
  // Execute all the checks immediately
  workers.gatherAllChecks();

  // Call the loop so the checks will execute later on
  workers.loop();
}

workers.alertUserToStatusChange = (checkData)=>{
    let timestampString = new Date(checkData.lastChecked);
    let alertMsg = `--Alert--\n [${checkData.method}] ${checkData.protocol}://${checkData.url}\n is now ${checkData.state} @${timestampString}`;
    helpers.sendTwilioSMS(checkData.userPhone,alertMsg,(err)=>{
      if(!err){
        workers.log('CHCK',{'src': `${checkData.id}-INFO`, 'msg': alertMsg});
      } else {
        workers.log('CHCK',{'src': `${checkData.id}-ERR`,'msg':`${err}`, 'payload': {'checkData': checkData }});
      }
    });
}

// Compile a manifest of checks to run during this pass
workers.gatherAllChecks = ()=>{
  // Get all the checks
  _data.list('orders', (err,checks)=>{
    let _timestamp = Date.now();
    if(!err && checks && checks.length > 0){
      workers.log('INFO',{'src': `SYS-${Date.now()}`, 'msg':`${checks.length} checks @ ${_timestamp}`});
      // Iterate through and process each check
      checks.forEach((check)=>{
        _data.read('orders',check,(err,checkData)=>{
          if(!err && checkData){
            // Pass this verified check data over to validation
            workers.validateCheckData(checkData);
          } else {
            if(err || !checkData) workers.log('CHCK',{'src': `${checkData.id || 'INVALID'}-ERR`, 'msg':`${err || 'Faulty check data'}`, 'payload': {'check': check}});
          }
        });
      });
    } else {
      if(err || !checks) workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`${err || 'Faulty checks detected'}`, 'payload': {'checks': checks }});
      if(checks.length == 0) workers.log('INFO',{'src': `SYS-${Date.now()}`, 'msg':`No checks found to run`});
    }
  });
}

// Log to file the messages echoed by the system
// logData: {'src': 'string' [required], 'msg':'string' [required],'payload': 'object' [optional]}
workers.log = (type, logData)=>{
  type = (typeof(type) == 'string') ? type : false;
  logData = (typeof(logData) !== 'undefined') ? logData : false;
  src = (typeof(logData.src) == 'string') ? logData.src : false;
  let logPath = false;
  switch(type){
    case 'ATK':
    logPath = `logs/${type}`;
    // @TODO Notify administration pool of this attack... high priority

    break;
    case 'CHCK':
      logPath = `logs/${type}`;

      break;
    case 'ERR':
      logPath = `logs/${type}`;
      // @TODO Notify administration pool of this error... high priority.

      break;
    case 'INFO':
      logPath = `logs/${type}`;

      break;
    case 'PROB':
      logPath = `logs/${type}`;
      // @TODO Notify administration pool of this probe... normal priority

      break;
    case 'TEST':
      logPath = `logs/${type}`;

      break;
    case 'USER':
      logPath = `logs/${type}`;

      break;
    case 'WARN':
      logPath = `logs/${type}`;
      // @TODO: Notify administration pool of this warning... normal priority

      break;
    case false:
    default:
      // This is only going to happen if a valid type isn't sent
      // An error log will be created next, so logging & notification is handled..
      break;
  }
  // Ensure that the message is properly catagoried
  if(logPath && src){
    // Filter out 'INFO' messages unless in the staging environment
    if(config.envName=='staging' || (config.envName=='production' && type != 'INFO')){
      _data.create(logPath,src, logData, (err)=>{
        if(err) {
          _data.read(logPath,src,(err,existingLogData)=>{
            if(!err && existingLogData){
              existingLogData = (typeof(existingLogData) == 'object' && existingLogData instanceof Array) ? existingLogData : [existingLogData];
              existingLogData.push(logData);
              _data.update(logPath, src, existingLogData, (err)=>{
                if(err){
                  workers.log('ERR', {'src': `SYS-${Date.now()}`, 'msg': `Failed to update a log file. hrm...  Perhaps add a random interval to read again?`, 'payload': {'err': err, 'logPath': logPath, 'src': src,'type': type, 'logData': logData}});
                }
              });
            } else {
              workers.log('ERR', {'src': `SYS-${Date.now()}`, 'msg': `Failed to create a log file... and also reading an existing one. hrm...  Perhaps add a random interval to read again?`, 'payload': {'err': err, 'logPath': logPath, 'src': src,'type': type, 'logData': logData}});
            }
          });
        }
      });
    }
  }
  else workers.log('ERR', {'src': `SYS-${Date.now()}`, 'msg': `Logging worker received an invalid type parameter`, 'payload': {'type': type, 'logData': logData, 'src': src}});
}

// Timer to execute the worker process queue once per minute
workers.loop = ()=>{
  setInterval(()=>{
    workers.gatherAllChecks();
  },1000*60);
}

// Perform the task defined by the provided checkData
workers.performCheck = (checkData)=>{
  // Prepare the initial check outcome
  let checkOutcome = {
    'error': false,
    'responseCode': false
  };

  // Mark that the outcome has not been sent yet
  let outcomeSent = false;

  // Parse the hostname and path out of the original check data
  let parsedUrl = url.parse(checkData.protocol+'://'+checkData.url, true);
  let hostName = parsedUrl.hostname;
  let path = parsedUrl.path; // Pull entire path including query strings

  // Construct the request
  let requestDetails = {
    'protocol': checkData.protocol+':',
    'hostname': hostName,
    'method':checkData.method,
    'path':path,
    'timeout':checkData.timeoutSeconds * 1000
  };

  let _requestModule = (checkData.protocol == 'http') ? http : https;
  let req = _requestModule.request(requestDetails, (res)=>{
    // Grab the status of the sent request
    let status = res.statusCode;

    // Update the checkOutcome and pass the data along
    checkOutcome.responseCode = status;
    if(!outcomeSent){
      workers.processCheckOutcome(checkData, checkOutcome);
      outcomeSent = true;
    }
  });

  // Bind to the error event so it doesn't ge thrown up
  req.on('error',(e)=>{
    checkOutcome.error = {
      'error': true,
      'value': e
    }

    if(!outcomeSent){
      workers.processCheckOutcome(checkData, checkOutcome);
      outcomeSent = true;
    }
  });

  // Bind to the timeout event
  req.on('timeout',(e)=>{
    checkOutcome.error = {
      'error': true,
      'value': 'timeout'
    }

    if(!outcomeSent){
      workers.processCheckOutcome(checkData,checkOutcome);
      outcomeSent = true;
    }
  });

  // End/Send the request
  req.end();
}

// Process the check outcome, update check data as needed, trigger an alert to notify of a change in status.
// Special logic for accomodating a check that has never been tested before
workers.processCheckOutcome = (checkData, checkOutcome)=>{
  // Determine whether the check is up or down.
  let state = (!checkOutcome.error && checkOutcome.responseCode && checkData.successCodes.indexOf(checkOutcome.responseCode) > -1) ? 'up' : 'down';

  // Decide if an alert is warranted
  let alertWarranted = (checkData.lastChecked && checkData.state !== state) ? true : false;

  // Update the check data
  let processedCheckData = checkData;
  processedCheckData.state = state;
  processedCheckData.lastChecked = Date.now();

  // Save the updates
  _data.update('checks',processedCheckData.id,processedCheckData,(err)=>{
    if(!err){
      if(alertWarranted){
        workers.alertUserToStatusChange(processedCheckData);
      } else {
        workers.log('CHCK',{'src': `${processedCheckData.id || 'INVALID'}-INFO`,'msg':`Outcome remains unchanged.`,'payload':{'processedCheckData':processedCheckData}});
      }
    } else {
      workers.log('CHCK',{'src': `${processedCheckData.id || 'INVALID'}-ERR`,'msg':`Updating check data`, 'payload': {'err':err,'processedCheckData':processedCheckData}});
    }
  });
}

// Validate the provided checkData for inconsistancies
workers.validateCheckData = (checkData)=>{
  checkData = (typeof(checkData) == 'object' && checkData !== null) ? checkData : {};
  checkData.id = (typeof(checkData.id)=='string' && checkData.id.trim().length > 0) ? checkData.id : false;
  checkData.userPhone = (typeof(checkData.userPhone)=='string' && checkData.userPhone.trim().length > 0) ? checkData.userPhone : false;
  checkData.protocol = (typeof(checkData.protocol) == 'string' && ['https','http'].indexOf(checkData.protocol) > -1) ? checkData.protocol.trim() : false;
  checkData.url = (typeof(checkData.url) == 'string' && checkData.url.trim().length > 0) ? checkData.url.trim() : false;
  checkData.method = (typeof(checkData.method) == 'string' && ['POST','GET','PUT','DELETE'].indexOf(checkData.method) > -1) ? checkData.method.trim() : false;
  checkData.successCodes = (typeof(checkData.successCodes) == 'object' && checkData.successCodes instanceof Array && checkData.successCodes.length > 0) ? checkData.successCodes : false;
  checkData.timeoutSeconds = (typeof(checkData.timeoutSeconds) == 'number' && checkData.timeoutSeconds % 1 === 0 && checkData.timeoutSeconds >= 1 && checkData.timeoutSeconds <= 5) ? checkData.timeoutSeconds : false;

  // Initialize the check for further processing
  checkData.state = (typeof(checkData.state)=='string' && ['up','down'].indexOf(checkData.state)> -1) ? checkData.state : 'down';
  checkData.lastChecked = (typeof(checkData.lastChecked) == 'number' && checkData.lastChecked % 1 === 0 && checkData.lastChecked > 0) ? checkData.lastChecked : false;

  // If all the check data is valid, pass along for further processing.
  if(checkData.id &&
    checkData.userPhone &&
    checkData.protocol &&
    checkData.url &&
    checkData.method &&
    checkData.successCodes &&
    checkData.timeoutSeconds){
      workers.performCheck(checkData);
    } else {
      workers.log('CHCK',{'src': `${checkData.id || 'INVALID'}-ERR`,'msg':`Check data did not pass validation`,'payload':{'checkData': `${checkData}`}});
    }
}


// Export the module
module.exports = workers;
