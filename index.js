const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const mongodb = require('mongodb');
const ObjectID = require('mongodb').ObjectID;
let serverUrl;
let serverPort;

global.serverUrl = 'localhost';
global.serverPort = 27017;

global.baseFee = 5;
global.sequentialFee = 3;
global.invoiceWindowTime = 30; // in mins

const app = express();

app.set('superSecret', config.secret);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cors());

app.use(morgan(':remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms'));

const rootApi = require('./routes/root');
const user = require('./routes/user');
const locker = require('./routes/locker');
const statistics = require('./routes/statistics');

global.loadMongoDB = async function() {
  console.log(serverUrl, serverPort);
  const client = mongodb.MongoClient.connect(`mongodb://${this.serverUrl}:${this.serverPort}`, {
    useNewUrlParser: true
  });

  return await client;
}

global.loadCollections = async function(collectionName) {
  const client = await loadMongoDB();

  return client.db('Thesis').collection(collectionName);
}

global.calculateFee = function(hours) {
  return baseFee + (sequentialFee * hours);
}

Object.prototype.constructError = function (errorCode, errorMsg) {
  this.success = false;
  if (!this.error_code) {
    this.error_code = [];
  }
  this.error_code.push(errorCode);

  if (!this.error_msg) {
    this.error_msg = [];
  }
  this.error_msg.push(errorMsg);

  if (errorCode === 02) {
    console.error(`Server error: ${errorMsg}`);
  }
}

Object.prototype.constructBody = function (body) {
  this.success = true;
  this.data = body;
}

Object.prototype.ObjectKeyMapper = function (oldKey, newKey) {
  let value = this[oldKey];

  delete this[oldKey];
  this[newKey] = value;
}

global.verifyObjectId = function(id) {
  return new Promise((resolve, reject) => {
    try {
      let objectId = new ObjectID(id)

      resolve(objectId);
    } catch (error) {
      reject(error);
    }
  });
}

global.getRentalData = async (userNum, unitNum, haveRental = true) => {
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  let userAuth = async (userNum) => {
    return await rentalInfos
      .findOne({
        'user_num': userNum
      })
      .then(result => {
        if(!!result && haveRental){
          return Promise.resolve();
        }else if(!result && !haveRental){
          return Promise.resolve();
        }else if(!result){
          return Promise.reject(2);
        }else {
          return Promise.reject(1);
        }
      })
      .catch(err => Promise.reject(err));
  }

  let unitAuth = async (unitNum) => {
    return await rentalInfos
      .findOne({
        'unit_num': unitNum
      })
      .then(result => {
        if(!!result){
          let mode = result.mode;
          
          if((mode == 'available' && !haveRental) || (mode == 'occupied' && haveRental)) {
            return Promise.resolve();
          }else{
            return Promise.reject(1);
          }
        }else{
          return Promise.reject(2);
        }
      })
      .catch(err => Promise.reject(err));
  }

  return await Promise.all([userAuth(userNum), unitAuth(unitNum)])
    .then(async resolves => {
      return await rentalInfos
        .findOne({
          'user_num': userNum,
          'unit_num': unitNum
        })
        .catch(err => {console.error(err); return Promise.reject(-1)})
        .then(result => {
          if((!!result && haveRental) || (!result && !haveRental)){
            return Promise.resolve(result);
          }else{
            return Promise.reject(2);
          }
        })
        .catch(err => Promise.reject(err));
    })
    .catch(err => Promise.reject(err));
}

// Returns True if has time left otherwise false
global.isTimeAuth = (startTime, endTime, hasTimeLeft = true, overThreshold = false) => {
  const timeLeft = endTime - startTime;
  const thresholdTime = 60*60*24*5 // TODO: Save in global variable // 5 days

  if(((timeLeft > 0) && hasTimeLeft) || ((timeLeft <= 0) && !hasTimeLeft)){
    if(overThreshold){
      if(!hasTimeLeft){
        if(timeLeft*-1 >= thresholdTime){
          return Promise.resolve(true);
        }else{
          return Promise.resolve(false);
        }
      }else{
        console.error('Invalid hasTimeLeft and overThreshold parameter combination.')
        return Promise.reject(0);
      }
    }
    
    return Promise.resolve(true);
  }else{
    return Promise.resolve(false);
  }
}

global.getCurrentSessionID = async (userNum, unitNum, hasTimeLeft) => {
  const sessionLogs = await loadCollections('Session_Log');
  const currTime = Math.floor((new Date).getTime()/1000);

  return await getRentalData(userNum, unitNum)
    .then(async result => await verifyObjectId(result.session_id))
    .then(async id => await sessionLogs
      .findOne({ '_id': id })
      .catch(err => { console.error(err); return Promise.reject(0)})
    )
    .then(async result =>  (!!result ? Promise.resolve(result) : Promise.reject(2)))
    .then(async sessionData => {

      if(await isTimeAuth(currTime, sessionData.end_date, hasTimeLeft)) {
        console.log(sessionData.user_num);

        return Promise.resolve(sessionData._id.toString());
      }else{
        return Promise.reject(1); // wildcard error for session data not found
      }
    })
    .catch(err => Promise.reject(err));
}

global.capitalizeFirstLetter = (string) => string.toLowerCase().replace(/[^\s]+/g, (match) =>
    match.replace(/^./, (m) => m.toUpperCase()));

// CORS middleware
var allowCrossDomain = function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
 
  next();
}

app.use(allowCrossDomain);
app.options('/', cors());
app.use('/', rootApi);
app.use('/user', user);
app.use('/locker', locker);
app.use('/stats', statistics);

const port = process.env.PORT || 2000;

app.listen(port, function() {
  console.log(`Server has started on port ${port} `);
})