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
global.db;

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
  const client = mongodb.MongoClient.connect(`mongodb://${this.serverUrl}:${this.serverPort}/Thesis`, {
    useNewUrlParser: true
  });

  return await client;
}

global.loadCollections = async function(collectionName) {
  const client = await loadMongoDB();

  return client.collection(collectionName);
}

global.calculateFee = function(hours) {
  return Math.ceil(baseFee + (sequentialFee * hours));
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

Object.prototype.mapToObject = async (key, data) => {

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
  const rentalInfos = db.collection('Rental_Unit_Info');
  
  /*
    Resolves if user has no current rental log and is have no rental,
    , if user has current rental and have rental, or if unit is reserved
    by user
  */
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
        } else if (result.mode == 'reserved'){
          return Promise.resolve();
        } else if(!result){
          return Promise.reject(2);
        }else {
          console.log(haveRental);
          return Promise.reject(1);
        }
      })
      .catch(err => Promise.reject(err));
  }

  /*
    Resolves if mode is available and have no rental, mode is occupied and have rental or
    mode is reserved
  */
  let unitAuth = async (unitNum) => {
    return await rentalInfos
      .findOne({
        'unit_num': unitNum
      })
      .then(result => {
        if(!!result){
          let mode = result.mode;
          if(
            (mode == 'available' && !haveRental) || 
            (mode == 'occupied' && haveRental) || 
            (mode == 'reserved')
          ){
            if(mode == 'reserved') {
              return Promise.resolve(mode);
            }
            return Promise.resolve();
          }else{
            console.log(mode, unitOwner, userNum);
            return Promise.reject(1);
          }
        }else{
          return Promise.reject(2);
        }
      })
      .catch(err => {
        console.log(err); 
        return Promise.reject(err)
      });
  }

  /*
    Resolves if user and unit are resolved, and if have current user & unit rental record and have rental,
    or if have no current user & unit rental record and have no rental
  */
  return await Promise.all([userAuth(userNum), unitAuth(unitNum)])
    .then(async resolves => {
      return await rentalInfos
        .findOne({
          'unit_num': unitNum
        })
        .catch(err => {console.error(err); return Promise.reject(-1)})
        .then(result => {
          return Promise.resolve((resolves[1] == 'reserved' || haveRental) ? result : true);
          // if((!!result && haveRental) || (!result && !haveRental)){
          //   return Promise.resolve(haveRental ? result : true);
          // }else{
          //   console.log(result, haveRental);
          //   return Promise.reject(2);
          // }
        })
        .catch(err => Promise.reject(err));
    })
    .catch(err => {
      return Promise.reject(err)
    });
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

global.getCurrentSessionID = async (userNum, unitNum, hasTimeLeft, haveRental = true) => {
  const sessionLogs = db.collection('Session_Log');
  const currTime = Math.floor((new Date).getTime()/1000);

  return await getRentalData(userNum, unitNum, haveRental)
    .then(async result => {
      if(typeof result == 'boolean'){
        if(result){
          return Promise.resolve(true);
        }
      }else{
        return await verifyObjectId(result.session_id)
        .then(async id => await sessionLogs
          .findOne({ '_id': id })
          .then(async resultSession =>  {
            let unitOwner = result.user_num;

            if(!!resultSession){
              if(await isTimeAuth(currTime, resultSession.end_date, hasTimeLeft)) {
                if((unitOwner == userNum) && (result.mode == 'reserved')){
                  return Promise.resolve(resultSession._id.toString());
                } else if(result.mode != 'reserved'){
                  return Promise.resolve(resultSession._id.toString());
                } else{
                  return Promise.reject(1); // wildcard error for session data not found
                }
              }else{
                if((result.mode == 'reserved')){
                  return Promise.resolve(true);
                }else{
                  return Promise.reject(1); // wildcard error for session data not found
                }
              }
            }else {
              if(!haveRental){
                return Promise.resolve(true);
              }else {
                return Promise.reject(2);
              }
            }
          })
          .catch(err => { 
            return Promise.reject(0)
          })
        )
      }
    })
    .catch(err => {
      return Promise.reject(err);
    });
}

global.capitalizeFirstLetter = (string) => string.toLowerCase().replace(/[^\s]+/g, (match) =>
    match.replace(/^./, (m) => m.toUpperCase()));

global.activityType = ['rent_auth', 'extend_auth', 'overdue_auth','reserve_auth' , 'rent_session', 'extend_session', 'overdue_session', 'reserve_session', 'end_session', 'unit_usage'];
global.activityObj = {
  RENT_AUTH: activityType[0],
  EXTEND_AUTH: activityType[1],
  OVERDUE_AUTH: activityType[2],
  RESERVE_AUTH: activityType[3],
  RENT_SESSION: activityType[4],
  EXTEND_SESSION: activityType[5],
  OVERDUE_SESSION: activityType[6],
  RESERVE_SESSION: activityType[7],
  END_SESSION: activityType[8],
  UNIT_USAGE: activityType[9],
}

global.baseActivity = [
  'rent',
  'extend',
  'overdue',
  'reserve'
]

global.activityAuth = [
  activityObj.RENT_AUTH,
  activityObj.EXTEND_AUTH,
  activityObj.OVERDUE_AUTH,
  activityObj.RESERVE_AUTH
]

global.activitySession = [
  activityObj.RENT_SESSION,
  activityObj.EXTEND_SESSION,
  activityObj.OVERDUE_SESSION,
  activityObj.RESERVE_SESSION
]
    

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

mongodb.MongoClient.connect(`mongodb://localhost:27017/Thesis`, {
  useNewUrlParser: true,
}, (err, client) => {
  if(err) throw err;

  db = client.db('Thesis');

  app.listen(port);
  console.log(`Server has started on port ${port} `);
});