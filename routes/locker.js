const express = require('express');
const mongodb = require('mongodb');
const ObjectID = require('mongodb').ObjectID;
const serverUrl = 'localhost';
const serverPort = 27017;
const jwt = require('jsonwebtoken');
const config = require('../config');

const activityType = ['rent_auth', 'extend_auth', 'overdue_auth','reserve_auth' , 'rent_session', 'extend_session', 'overdue_session', 'reserve_session', 'end_session', 'unit_usage'];
const activityObj = {
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

const router = express.Router();

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

Object.prototype.ObjectKeyMapper = function (oldKey, newKey) {
  let value = this[oldKey];

  delete this[oldKey];
  this[newKey] = value;
}

async function verifyObjectId(id, label, index) {
  return new Promise((resolve, reject) => {
    try {
      let objectId = new ObjectID(id);

      resolve(objectId);
    } catch (error) {
      reject(error);
    }

  });
}

async function loadMongoDB() {
  const client = await mongodb.MongoClient.connect(`mongodb://${serverUrl}:${serverPort}`, {
    useNewUrlParser: true
  });

  return client;
}

async function loadCollections(collectionName) {
  const client = await loadMongoDB();

  return client.db('Thesis').collection(collectionName);
}

router.use((req, res, next) => {
  const token = req.body.token || req.query.token || req.headers['x-access-token'];

  let body = {};

  if(token) {
    jwt.verify(token, config.secret, (err, decoded) => {
      if(err) {
        body.constructError(05, 'Failed to authenticate');
        return res.send(body);
      }else {
        req.decoded = decoded;
        next();
      }
    })
  }else {
    body.constructError(05, 'Please encode a valid token');

    return res.status(403).send(body);
  }

});

router.get('/esp-test', async (req, res) => {
  console.log('connection success');
  res.status(200).send('test');
});

router.post('/esp-test', async (req, res) => {
  let body = req.body.data;
  console.log('connection success');
  res.status(200).send(JSON.stringify(body));
});

router.get('/unit-list', async (req, res) => {
  const lockers = await loadCollections('Locker_Units');
  const area = req.body.area_num || null;

  let body = {};

  if (area) {
    await lockers
      .find({
        'unit_area': area
      }, {
        projection: {
          'slave_address': 0
        }
      })
      .toArray()
      .then(data => {
        let body = {};

        if (data.length > 0) {
          for (let i = 0; i < data.length; i++) {
            data[i].ObjectKeyMapper('_id', 'unit_id');
          }

          body.data = data;
          body.success = true;
        } else {
          body.constructError(00, `Area number #${area} not found.`);
        }

        res.send(body);
      })
      .catch(err => {
        body.constructError(02, err);
        res.send(body);
      })
  } else {
    body.constructError(01, 'Area number parameter is required.');
    res.send(body);
  }

});

router.get('/area-list', async (req, res) => {
  const areas = await loadCollections('Locker_Area');

  let body = {};
  await areas
    .find({})
    .toArray()
    .then(data => {
      for (let i = 0; i < data.length; i++) {
        data[i].ObjectKeyMapper('_id', 'area_id');
      }

      body.data = data;
      body.success = true;

      res.send(body);
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(body);
    })
});

router.get('/area-info', async (req, res) => {
  const areas = await loadCollections('Locker_Area');
  const areaId = req.body.area_id || req.query.area_id || null;

  let body = {};

  if(areaId){
    verifyObjectId(areaId)
      .then(async id => {
        await areas
        .find({
          '_id': id
        })
        .toArray()
        .then(data => {
          if(data.length > 0){
            bodyData = data[0];

            bodyData.ObjectKeyMapper('_id', 'area_id');

            body.data = bodyData;
            body.success = true;

            res.send(body);
          }else{
            body.constructError(00, `Found no information available on area ID ${id}.`);
          }
          res.send(body);
        })
        .catch(err => {
          body.constructError(02, err);
          res.send(body);
        })
      })
      .catch(err => {
        console.error(err);
        body.constructError(03, `Please encode a valid Area ID format and value.`);
        res.send(body);
      });
  }else{
    body.constructError(01, 'Area ID parameter is required.');
    res.send(body);
  }

  // res.send(body);
});

router.get('/suggest-unit', async (req, res) => {
  const lockers = await loadCollections('Locker_Units');
  var area = req.body.area_num || req.query.area_num || null;

  area = parseInt(area);

  let body = {};

  if(area){
    await lockers
      .find({
        'unit_area': area,
        'unit_status': 'available'
      }, {
        projection: {
          'slave_address': 0
        }
      })
      .toArray()
      .then(data => {
        let body = {};

        if (data.length > 0) {
          let max = data.length - 1;
          let min = 0;
          let randomIndex = Math.floor(Math.random()*(max-min+1)+min); 
          let bodyData = data[randomIndex];

          bodyData.ObjectKeyMapper('_id', 'unit_id');

          body.data = bodyData;
          body.success = true;
        } else {
          body.constructError(00, `No available locker units on Area #${area}.`);
        }

        res.send(body);
      })
      .catch(err => {
        body.constructError(02, err);
        res.send(body); 
      })
  }else{
    body.constructError(01, 'Area number parameter is required.');
    res.send(body);
  }

});

router.post('/transaction/authorization', async (req, res) => {
  const currTime = Math.floor((new Date).getTime()/1000);
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const sessionLogs = await loadCollections('Session_Log');

  const unitNum = req.body.unit_num || null;
  const userNum = req.decoded.id_num || null;
  const transactionType = req.body.transaction_type || null;

  let transActivityType = null;

  let SESSION_ID;

  switch (transactionType) {
    case 'rent':
      transActivityType = activityObj.RENT_AUTH;
      break;

    case 'extend':
      transActivityType = activityObj.EXTEND_AUTH;
      break;

    case 'overdue':
      transActivityType = activityObj.OVERDUE_AUTH;
      break;

    case 'reserve':
      transActivityType = activityObj.RESERVE_AUTH;
      break;

    default:
      break;
  }

  let apiCodes = [];
  let body = {};

  async function isUserAuthorized(userNum, type) {
    if (userNum) {
      try {
        let id = new ObjectID(userNum);

        return await isSessionAuth('user_num', userNum, type)
          .then(isAuth => {
            return Promise.resolve(isAuth);
          })
          .catch(err => {
            return Promise.reject(err);
          })

      } catch (error) {
        body.constructError(3.2, 'Please encode a valid User ID format and value.');
        return Promise.reject('Invalid user id');
      }
    } else {
      body.constructError(1.2, `User ID parameter is required.`);
      return Promise.reject(false);
    }
  }

  async function isUnitAuthorized(unitNum, type) {
    if (unitNum) {
      try {
        let id = new ObjectID(unitNum);
        return await isSessionAuth('unit_num', unitNum, type)
          .then(isAuth => {
            return Promise.resolve(isAuth);
          })
          .catch(err => {
            return Promise.reject(false);
          })
        
      } catch (error) {
        body.constructError(3.1, 'Please encode a valid Unit ID format and value.');
        return Promise.reject(false);
      }
    } else {
      body.constructError(1.1, 'Unit ID parameter is required.');
      return Promise.reject(false);
    }
  }

  async function isTransactionTypeValid(transactionType) {
    if(transactionType){
      if(activityType.includes(transactionType)){
        return Promise.resolve(true);
      }else{
        body.constructError(3, 'Please encode a valid transaction type format and value.');
        return Promise.reject(false);
      }
    }else{
      body.constructError(1, `Transaction type parameter is required.`);
      return Promise.reject(false);
    }
  }

  async function isSessionAvailable(idKey, idValue, type){
    queryObj = {};
    queryObj[idKey] = idValue;
    return await rentalInfos
      .findOne(queryObj)
      .then(async rentalData => {
        let sessionId = null;
        if(rentalData){
          try{
            sessionId = rentalData.session_id.toString();
          }catch(e){}
        }
        if(sessionId){
          try {
            let objectId = new ObjectID(sessionId);
            
            if (!!rentalData) {
              if(['occupied', 'reserved'].includes(rentalData.mode)){ 
                return await sessionLogs
                  .findOne({
                    '_id': objectId,
                  })
                  .then(async sessionData => {
                    if(sessionData){
                      let sessionEndTime = parseFloat(sessionData.end_date);
                      if((sessionEndTime - currTime) > 0){  
                        if(!SESSION_ID){
                          SESSION_ID = sessionId;
                        }
                        return Promise.resolve(false);
                      }else{
                        return await updataAvailableSession();
                      }
                    }else{
                      return await updataAvailableSession();
                    }

                    async function updataAvailableSession(){
                      await rentalInfos
                        .updateOne(
                          queryObj
                        , {
                          $set: {
                            "mode": "available",
                            "session_id": null,
                            "user_num": null
                          }
                        })
                    return Promise.resolve(true);
                    }
                    
                  })
              }else if(rentalData.mode == 'available'){
                return Promise.resolve(true);
              } 
            } else {
              return Promise.resolve(true);
            }
          } catch (error) {
            body.constructError(03, `Please encode a valid Session ID format and value.`);
            return Promise.resolve(false);
          }
        }else{
          if([activityObj.RENT_AUTH,
            activityObj.RENT_SESSION,
            activityObj.RESERVE_AUTH,
            activityObj.RESERVE_SESSION
          ].includes(type)){
            return Promise.resolve(true);
          }else{
            body.constructError(1.2, `Session ID parameter is required.`);
            return Promise.reject(false);
          }
        }
      })
      .catch(err => {
        body.constructError(02, err);
        return Promise.reject(false);
      });
  }

  async function isSessionAuth(idKey, idValue, type){
    return await isSessionAvailable(idKey, idValue, type)
      .then(isAvailable => {
        if([activityObj.RENT_AUTH,
            activityObj.RENT_SESSION,
            activityObj.RESERVE_AUTH,
            activityObj.RESERVE_SESSION,
            activityObj.OVERDUE_AUTH,
            activityObj.OVERDUE_SESSION,
          ].includes(type)){
          isAuth = isAvailable;
        }else if([
          activityObj.EXTEND_AUTH,
          activityObj.EXTEND_SESSION
          ].includes(type)){
          isAuth = !isAvailable;
        }
        if(!isAuth){
          let apiCode = 0;
          if(idKey == 'unit_num'){
            apiCode = 1;
          }else if(idKey == 'user_num'){
            apiCode = 2;
          }
          apiCodes.push(apiCode);
        }
        return Promise.resolve(isAuth);
      })
      .catch(err => {
        return Promise.reject(false);
      });
  }

  await Promise.all([
    isUnitAuthorized(unitNum, transActivityType),
    isUserAuthorized(userNum, transActivityType),
    isTransactionTypeValid(transActivityType)
  ]).then(async auth => {
    const activityLogs = await loadCollections('Unit_Activity_Logs');

    let unitAuthorized = auth[0];
    let userAuthorized = auth[1];
    let rentAuthorized = await unitAuthorized && await userAuthorized;

    var sessionId = null;

    if([activityObj.OVERDUE_AUTH,
      activityObj.OVERDUE_SESSION,
      activityObj.EXTEND_AUTH,
      activityObj.EXTEND_SESSION
      ].includes(transActivityType)){
      sessionId = SESSION_ID;
    }

    activityLogs.insertOne({
      'type': transActivityType,
      'date': currTime,
      'authorized': await rentAuthorized,
      'authenticated': false,
      'session_id': sessionId
    }, {}, (err, result) => {
      if (!err && (result.insertedCount >= 1)) {
        let data = {
          'activity_log_id': result.insertedId,
          'authorized': rentAuthorized
        }

        body.data = data;
        apiCodes.length > 0 ? body.data.api_msg_code = apiCodes : null;
        body.success = true;

        res.send(body);
      } else {
        body.constructError(02, 'There is a problem checking your unit. Please try again later.');
        res.send(body);
      }
    })
  }).catch(err => {
    console.error(err);
    res.send(body);
  });
});

router.post('/transaction/feed', async (req, res) => {
  const currTime = Math.floor((new Date).getTime()/1000);
  const activityLogs = await loadCollections('Unit_Activity_Logs');
  const authLogId = req.body.auth_activity_log_id || null;
  const amount = req.body.transaction_amount || null;
  const userNum = req.decoded.id_num || null;

  let body = {};
  !amount ? body.constructError(01, `Amount parameter is required.`) : null;
  !userNum ? body.constructError(01, `User Id parameter is required.`) : null;

  if (amount && userNum) {
    await isFeedAuthorized(authLogId, false)
      .then(async authData => {
        const isAuth = authData.isAuth;
        const transactionType = authData.transactionType;

        async function isUpdateAuthorized() {
          return new Promise(async (resolve, reject) => {
            if (isAuth) {
              const transactionLogs = await loadCollections('Transaction_Log');

              await transactionLogs
                .insertOne({
                  'type': transactionType,
                  'amount': amount,
                  'date': currTime,
                  'activity_log_id': authLogId,
                  'user_num': userNum
                })
                .then(data => {
                  resolve(data);
                })
                .catch(err => {
                  reject(err);
                })
            } else {
              reject(err);
            }
          })
        }

        body.data = {
          'transaction_authorized': false,
          'date': currTime
        };
        body.success = true;

        isUpdateAuthorized()
          .then(async result => {
            body.data.transaction_authorized = true;
            await activityLogs
              .updateOne({
                '_id': new ObjectID(authLogId)
              }, {
                $set: {
                  "authenticated": true
                }
              })
            res.send(body);
          })
          .catch(err => {
            console.error(err);
            body.success = true;
            res.send(body);
          })
      })
      .catch(bodyError => {
        res.send(bodyError);
      })
  } else {
    res.send(body);
  }
});

router.post('/transaction/session', async (req, res) => {
  const currTime = Math.floor((new Date).getTime()/1000);
  const userNum = req.decoded.id_num || null;
  const authLogId = req.body.auth_activity_log_id || null;
  const unitNum = req.body.unit_num || null;
  const sessionDuration = req.body.session_duration || null;
  const sessionDurationSeconds = sessionDuration * 60;
  const sessionEndDate = currTime + sessionDurationSeconds;

  let body = {};

  !userNum ? body.constructError(01, `User ID parameter is required.`) : null;
  !unitNum ? body.constructError(01, `Unit ID parameter is required.`) : null;
  !authLogId ? body.constructError(01, `Authorization Log ID parameter is required.`) : null;
  !sessionDuration ? body.constructError(01, 'Session duration parameter is required.') : null;

  if (userNum && unitNum && authLogId && sessionDuration) {
    const unitActivityLogs = await loadCollections('Unit_Activity_Logs');

    await isFeedAuthorized(authLogId, true)
      .then(async authData => {
        const sessionLogs = await loadCollections('Session_Log');
        const isAuth = authData.isAuth;
        const transactionType = authData.transactionType;
        let sessionId = null;

        if (isAuth) {
          let transActivityType = null;

          async function updateSession(){
            switch (transactionType) {
              case 'rent_auth':
                transActivityType = activityObj.RENT_SESSION;
                return await sessionLogs
                  .insertOne({
                    "start_date": currTime,
                    "end_date": sessionEndDate,
                    "user_num": userNum,
                    "unit_num": unitNum,
                  })
                  .then(async data => {
                    return await sessionLogs
                      .findOne({
                        'user_num': userNum,
                        'unit_num': unitNum
                      })
                      .then(data => {
                        return Promise.resolve(data._id.toString());
                      })
                  })
                  .then(async id => {
                    const rentalInfos = await loadCollections('Rental_Unit_Info');
                    await rentalInfos
                      .updateOne({
                        'unit_num': unitNum
                      }, {
                        $set: {
                          'mode': 'occupied',
                          'session_id': id,
                          'user_num': userNum
                        }
                      })
                      return Promise.resolve(id);
                  })
                
                break;
          
              case 'extend_auth':
                transActivityType = activityObj.EXTEND_SESSION;

                return await getSessionByRentalUnit(unitNum)
                  .then(async id => {
                    return await verifyObjectId(id)
                      .then(async sessionId => {
                        return await sessionLogs
                          .findOne({
                            '_id': sessionId
                          })
                          .then(data => {
                            let currEndTime = data.end_date;
                            let resData = {
                              'session_id': id,
                              'curr_end_time': currEndTime
                            }
                            return Promise.resolve(resData);
                          })
                          .catch(e => {
                            console.error(e);
                            return Promise.reject(e);
                          })
                      })
                      .catch(e => {
                        console.error(e);
                        console.error('Please encode valid session ID format and value.');
                        return Promise.reject(e);
                      })
                      .then(async resData => {
                        currEndTime = resData.curr_end_time;
                        sessionId = resData.session_id;
                        if(currEndTime){
                          let newEndTime = currEndTime + sessionDurationSeconds;
                          return await sessionLogs
                            .updateOne({
                              '_id': new ObjectID(sessionId.toString())
                            }, {
                              $set: {
                                'end_date': newEndTime
                              }
                            })
                            .then(data => {
                              return Promise.resolve(sessionId);
                            })
                            .catch(e => {
                              console.error(e);
                              return Promise.reject(false);
                            })
                        }else{
                          return Promise.reject('Current end time is NaN');
                        }
                      })
                    
                  })

                break;
          
              case 'overdue_auth':
                transActivityType = activityObj.OVERDUE_SESSION;


                break;
          
              case 'reserve_auth':
                transActivityType = activityObj.RESERVE_SESSION;
                break;
          
              default:
                break;
            }
          }

          await updateSession()
            .then(async id => {
              await unitActivityLogs
                .insertOne({
                  'type': transActivityType,
                  'date': currTime,
                  'authorized': true,
                  'authenticated': true,
                  'session_id': id
                })
                .then(result => {
                  let data = {
                    'authenticated': true,
                  }
    
                  body.data = data;
                  body.success = true;
    
                  res.send(body);
                })
                .catch(err => {
                  console.error(err);
                  res.send(body);
                })
            })
            .catch(e => {
              console.error(e);
              body.constructError(02, 'There is a problem checking your unit. Please try again later.');
              res.send(body);
            })
          
        } else {
          body.constructError(04, 'Authorized Log is not valid');
          res.send(body);
        }
      })
      .catch(err => {
          body.constructError(03, 'Please encode a valid Authorized Log ID format and value.');
          res.send(err);
      })
  }else{
    res.send(body);
  }

});

router.post('/transaction/end', async (req, res) => {
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const unitActivityLogs = await loadCollections('Unit_Activity_Logs');
  const currTime = Math.floor((new Date).getTime()/1000);

  const unitNum = req.body.unit_num || null;
  const userNum = req.decoded.id_num || null;

  let body = {};

  !unitNum ? body.constructError(01, `Unit ID parameter is required.`) : null;

  if(unitNum){
    await getCurrentSessionMatchId(userNum, unitNum)
      .then(async data => {
        if(data){
          let bodyData = {
            'msg': 'Your session has been terminated.'
          };
          let sessionId = data;

          await rentalInfos
            .updateOne({
              'unit_num': unitNum
            }, {
              $set: {
                'mode': 'available',
                'user_num': null,
                'session_id': null
              }
            })
            .then(async data => {
              await unitActivityLogs
                .insertOne({
                  'type': activityObj.END_SESSION,
                  'date': currTime,
                  'authorized': true,
                  'authenticated': true,
                  'session_id': sessionId
                })
              body.data = bodyData;
              body.success = true;
              res.send(body);
            })
        }else{
          body.constructError(4, 'Session has already ended.');
          res.send(body);
        }
      })
      .catch(err => {
        body.constructError(02, err);
        res.send(body);
      })
  }
})

// isFeedAuthorized checks for the authorization in Unit Activity Log 
async function isFeedAuthorized(authLogId, shouldBeAuthenticated) {
  if (authLogId) {
    return new Promise((resolve, reject) => {
      verifyObjectId(authLogId)
        .then(async id => {
          let resultData = {
            isAuth: false,
            transactionType: ''
          };
          const unitActivityLogs = await loadCollections('Unit_Activity_Logs');

          await unitActivityLogs
            .find({
              '_id': id
            }, {
              projection: {
                'authorized': 1,
                'type': 1,
                'authenticated': 1,
                '_id': 0
              }
            })
            .toArray()
            .then(data => {
              if (data.length > 0) {
                let thisData = data[0];
                let isAuth = false;
                let isRentAuth = false;

                resultData.transactionType = thisData.type;

                if (activityType.includes(thisData.type)) {
                  isRentAuth = true;
                  if (thisData.authorized && (thisData.authenticated === shouldBeAuthenticated)) {
                    isAuth = true;
                  } else {
                    let bodyError = {};
                    let errorMsg = 'Rental transaction is not authorized.';

                    if(shouldBeAuthenticated && (!thisData.authenticated)){
                      errorMsg = 'Transaction is not authenticated.'
                    }else if(!shouldBeAuthenticated && thisData.authenticated){
                      errorMsg = 'Transaction is already authenticated.'
                    }
                    bodyError.constructError(04, errorMsg);

                    return reject(bodyError);
                  }
                } else {
                  let bodyError = {};
                  bodyError.constructError(04, `Activity log type is not valid.`);

                  return reject(bodyError);
                }

                if (isAuth && isRentAuth) {
                  resultData.isAuth = true;
                  return resolve(resultData);
                } else {
                  resultData.isAuth = false;
                  return resolve(resultData);
                }
              } else {
                let bodyError = {};
                bodyError.constructError(0, `Activity log with ID ${authLogId} not found.`);

                return reject(bodyError);
              }
            })
            .catch(err => {
              let bodyError = {};
              bodyError.constructError(02, err);

              return reject(bodyError);
            })
        })
        .catch(err => {
          let bodyError = {};

          bodyError.constructError(03, 'Please encode a valid Authorized Log ID format and value.');
          reject(bodyError);
        })
    });
  } else {
    let bodyError = {};
    bodyError.constructError(01, `Activity log ID of rental authentication is required.`);
    return Promise.reject(bodyError);
  }
}

async function getSessionByRentalUnit(unitNum){
  const sessionLogs = await loadCollections('Session_Log');
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  
  if(unitNum){
    return await rentalInfos
      .findOne({
        'unit_num': unitNum
      })
      .then(result => {
        let sessionId = null;
        
        try{
          sessionId = result.session_id;
        }catch(e){
          console.error(e);
          return Promise.reject(false);
        }

        return Promise.resolve(sessionId);
      })
      .catch(e => {
        console.error(e);
      })
  }else{
    console.error('Session with Unit ID is not found.');
    return Promise.reject(false);
  }
}

// Returns the session id with matching user num from the rental unit info if the session is on going.
async function getCurrentSessionMatchId(userNum, unitNum){
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const sessionLogs = await loadCollections('Session_Log');
  const currTime = Math.floor((new Date).getTime()/1000);

  if(!!(userNum && unitNum)){
    return await rentalInfos
      .findOne({
        'unit_num': unitNum
      })
      .then(data => {
        if(data){
          try{
            let sessionId = data.session_id;
            return Promise.resolve(sessionId);
          }catch(e){
            return Promise.reject('Session ID not found on rental unit.');
          }
        }else{
          return Promise.reject('Rental unit not found.');
        }
      })
      .catch(err => {
        return Promise.reject(err);  
      })
      .then(async sessionId => {
        return await verifyObjectId(sessionId)
          .then(async id => {
            return await sessionLogs
              .findOne({
                '_id': id,
                'user_num': userNum
              })
              .then(data => {
                if(data){
                  let sessionEndTime = parseFloat(data.end_date);
                  if((sessionEndTime - currTime) > 0){  
                    return Promise.resolve(sessionId);
                  }else{
                    return Promise.resolve(false);
                  }
                }else{
                  return Promise.reject('ID number does not match with that of session log\'s');
                }
              })
              .catch(err => {
                console.error(err);
                return Promise.reject(err);
              })
          })
      })
  }
}

module.exports = router;