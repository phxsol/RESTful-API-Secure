/*
  * Create and export configuration values
  */

// container for all the environments
let environments = {};

// Staging Environment (Default)
environments.staging = {
  'httpPort': 3060,
  'httpsPort': 3061,
  'envName' : 'staging',
  'hashingSecret': 'ShhThisIsASecret',
  'maxChecks': 5,
  'twilio':{
    'accountSID':'ACb32d411ad7fe886aac54c665d25e5c5d',
    'authToken':'9455e3eb3109edc12e3d8c92768f7a67',
    'fromPhone':'+15005550006'
  }
};

// Production environments
environments.production = {
  'httpPort': 5060,
  'httpsPort': 5061,
  'envName': 'production',
  'hashingSecret': 'ShhThisIsASuperSecret',
  'maxChecks': 5,
  'twilio':{
    'accountSID':'ACb32d411ad7fe886aac54c665d25e5c5d',
    'authToken':'9455e3eb3109edc12e3d8c92768f7a67',
    'fromPhone':'+15005550006'
  }
};

// Determine which environment was passed as a command-line argument
let passedEnvironment = (typeof(process.env.NODE_ENV) == 'string') ? process.env.NODE_ENV.toLowerCase() : '';

// Check whether passed env has a defined configuration, else configure for staging (default)
let selectedEnvironment = (typeof(environments[passedEnvironment]) == 'object') ? environments[passedEnvironment] : environments.staging;

// export the module
module.exports = selectedEnvironment;
