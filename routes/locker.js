const express = require('express');
const ObjectID = require('mongodb').ObjectID;

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

router.get('/unit-list', async (req, res) => {
  const lockers = await loadCollections('Locker_Units');
  const area = req.body.area_num || null;

  let body = {};

  const page_cursor = req.body.page_cursor || req.query.page_cursor || 1;
  const page_size = req.body.page_size || req.query.page_size || 0;
  const skip_items = (page_cursor - 1) * page_size;

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
            return Promise.reject();
          }
        })
        .catch(err => {
          body.constructError(02, err);
          return Promise.reject();
        })
      })
      .catch(err => {
        console.error(err);
        body.constructError(03, `Please encode a valid Area ID format and value.`);
        console.log(body)
        res.send(body);
        return Promise.resolve();
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
  const unitActivities = await loadCollections('Unit_Activity_Logs');
  const sessionLogs = await loadCollections('Session_Log');

  const unitNum = parseInt(req.body.unit_num) || parseInt(req.query.unit_num) || null;
  const userNum = req.decoded.id_num || null;
  const transactionType = req.body.transaction_type || req.query.transaction_type || null;

  let body = {};

  !userNum ? body.constructError(1.2, `User Id parameter is required.`) : null;
  !unitNum ? body.constructError(1.1, `Unit Id parameter is required.`) : null;

  let transActivityType = null;

  let transAuth = async () => {
    if(!userNum || !unitNum){
      return Promise.reject(-1)
    }
    switch(transactionType){
      case 'rent':
        transActivityType = activityObj.RENT_AUTH;
  
        return await rentalInfos
          .findOne({
            'user_num': userNum,
            'unit_num': unitNum
          })
          .then(result => {
            if(!!result){
              body.success = true;
              body.data = result;
              return Promise.reject(1);
            }else{
              return Promise.resolve(true);
            }
          })
          .catch(err => {console.error(err); return Promise.reject(0)});

      case 'overdue': 
        transActivityType = activityObj.OVERDUE_AUTH;
        
        return await isSessionAuth(userNum, unitNum, false)
          .then(isAuth => {
            if(isAuth){
              return Promise.resolve(true);
            }else{
              return Promise.reject(3);
            }
          })
          .catch(err => Promise.reject(err));

      case 'extend': 
        transActivityType = activityObj.EXTEND_AUTH;

        return await isSessionAuth(userNum, unitNum, true)
          .then(isAuth => {
            if(isAuth){
              return Promise.resolve(true);
            }else{
              return Promise.reject(4);
            }
          })
          .catch(err => Promise.reject(err));
          
      case 'reserve':
        transActivityType = activityObj.RESERVE_AUTH;
        break;
      default:
        transActivityType = null;
    }
  }

  await transAuth()
    .then(async result => {
      return await sessionLogs
        .insertOne({
          'start_date': null,
          'end_date': null,
          'user_num': userNum,
          'unit_num': unitNum
        })
        .then(result => {
          let sessionId = result.insertedId.toString();

          return Promise.resolve(sessionId);
        })
        .catch(err => {console.error(err); return Promise.reject(0)});
    })
    .then(async sessionId => {
      return await unitActivities
        .insertOne({
          'type': transActivityType,
          'date': currTime,
          'authenticated': false,
          'session_id': sessionId
        })
        .then(result => {
          let unitActivityId = result.insertedId.toString();

          return Promise.resolve(unitActivityId);
        })
        .catch(err => {console.error(err); return Promise.reject(0)});
    })
    .then(unitAcitivityId => {
      body.constructBody({
        auth_acticity_id: unitAcitivityId
      });

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
          case 1:
            body.constructError(4, `User or Unit is not authorized for rental.`);
            break;
          case 2:
            body.constructError(4, `Rental info for User and Unit does not exists.`);
            break;
          case 3:
            body.constructError(4, `Cannot perform overdue service, session is ongoing.`);
            break;
          case 4:
            body.constructError(4, `Cannot perform extend service, session has expired.`);
            break;
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })
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
                  'amount': parseInt(amount),
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
  const unitNum = parseInt(req.body.unit_num) || null;
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
        const transactionLogs = await loadCollections('Transaction_Log');
        const isAuth = authData.isAuth;
        const transactionType = authData.transactionType;
        let sessionId = null;

        if (isAuth) {
          let transActivityType = null;
          
          verifyObjectId(authLogId)
            .then(async id => {
              return await transactionLogs
                .findOne({
                  'activity_log_id': authLogId
                })
                .then(async result => {
                  let resultData = await result;
                  return Promise.resolve(resultData.amount);
                })
                .catch(err => {
                  return Promise.reject(err);
                })
            })
            .catch(err => {
              return Promise.reject(err);
            })
            .then(async result => {
              const rfidCards = await loadCollections('RFID_Card');
              let amount = parseInt(await result);
              let totalAmountFee = baseFee + (sequentialFee * Math.ceil((sessionDuration/60)));
              let creditAmount = amount - totalAmountFee;
          
              if(totalAmountFee > amount){
                body.constructError(5, `Please insert a sufficient amount of atleast PHP ${totalAmountFee}`);
                return Promise.reject()
              }

              await rfidCards
                .findOne({
                  'id_num': userNum
                })
                .then(result => {
                  if(result){

                    return Promise.resolve(result.credit);
                  }else{
                    return Promise.reject('User not found with RFID Cards.');
                  }
                })
                .catch(err => {
                  return Promise.reject(err);
                })
                .then(async result => {
                  let credit = await result;

                  return await rfidCards
                    .updateOne({
                      'id_num': userNum
                    }, {
                      $set: {
                        'credit': creditAmount + credit
                      }
                    })
                    .then(result => {
                      return Promise.resolve();
                    })
                })
                .then(async result => {
                  return await updateSession()
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
                      return Promise.resolve();
                    })
                })
                .catch(err => {
                  return Promise.rejecet(err);
                })
                
            })
            .catch(err => {
              res.send(body);
            })

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
                        'unit_num': unitNum,
                        "start_date": currTime,
                        "end_date": sessionEndDate
                      })
                      .then(data => {
                        return Promise.resolve(data._id.toString());
                      })
                  })
                  .then(async id => {
                    const rentalInfos = await loadCollections('Rental_Unit_Info');
                    return await rentalInfos
                      .updateOne({
                        'unit_num': unitNum
                      }, {
                        $set: {
                          'mode': 'occupied',
                          'session_id': id,
                          'user_num': userNum
                        }
                      })
                      .then(async result => {
                        return Promise.resolve(id);
                      })
                      .catch(err => {
                        return Promise.reject(err);
                      })
                  })
          
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

        } else {
          body.constructError(04, 'Authorized Log is not valid');
          res.send(body);
        }
      })
      .catch(err => {
        console.error(err);
        body.constructError(03, 'Please encode a valid Authorized Log ID format and value.');
        res.send(err);
        return Promise.resolve();
      })
  }else{
    res.send(body);
  }

});

router.post('/transaction/end', async (req, res) => {
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const unitActivityLogs = await loadCollections('Unit_Activity_Logs');
  const lockers = await loadCollections('Locker_Units');
  const currTime = Math.floor((new Date).getTime()/1000);

  const unitNum = req.body.unit_num || null;
  const userNum = req.decoded.id_num || null;

  let body = {};

  !unitNum ? body.constructError(01, `Unit ID parameter is required.`) : null;

  if(unitNum){
    await getCurrentSessionMatchId(userNum, unitNum, true, null, true)
      .then(async data => {
        if(data){
          let bodyData = {
            'msg': 'Your session has been terminated.'
          };
          let sessionId = data.toString();
          
          await lockers
            .updateOne({
              'unit_number': unitNum
            }, {
              $set: {
                'unit_status': 'available',
              }
            })
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

async function isSessionAuth(userNum, unitNum, hasTimeLeft){
  const sessionLogs = await loadCollections('Session_Log');
  const currTime = Math.floor((new Date).getTime()/1000);

  return await sessionLogs
    .findOne({
      'user_num': userNum,
      'unit_num': unitNum
    })
    .catch(err => { console.error(err); return Promise.reject(0)} )
    .then(result => {
      if(!!result){
        let endDate = result.end_date;
        let timeLeft = endDate - currTime;
        
        if(((timeLeft > 0) && hasTimeLeft) || (timeLeft <= 0 && !hasTimeLeft)){
          return Promise.resolve(true);
        }else{
          return Promise.resolve(false);
        }
      }else{
        return Promise.reject(2);
      }
    })
    .catch(err => Promise.reject(err));
}

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
          console.error(err);
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

// Fetch session ID based on current rental unit number
async function getSessionByRentalUnit(unitNum){
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
async function getCurrentSessionMatchId(userNum, unitNum, onGoing, returnTimeLeft = false, ongGoingOpt = false){
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const sessionLogs = await loadCollections('Session_Log');
  const currTime = Math.floor((new Date).getTime()/1000);

  if(!!(userNum && unitNum)){
    return await rentalInfos
      .findOne({
        'user_num': userNum,
        'unit_num': unitNum,
        'mode': {
          $in: ['occupied', 'reserve']
        }
      })
      .then(result => {
        if(result){
          let sessionId = null;

          try{
            sessionId = result.session_id;
            sessionId = new ObjectID(sessionId);

            return Promise.resolve(sessionId);
          }catch(err){
            return Promise.reject(1);
          }
        }else{
          return Promise.resolve(false);
        }
      })
      .catch(err => {
        return Promise.reject(err);
      })
      .then(async sessionId => {
        if(!!sessionId){
          return await sessionLogs
            .findOne({
              '_id': sessionId
            })
            .then(result => {
              if(result){
                let sessionEndTime = parseFloat(result.end_date);
                let resolveData;
                let timeLeft = sessionEndTime - currTime;
                if((timeLeft > 0) && onGoing || ongGoingOpt){
                  resolveData = sessionId;
                }else if((timeLeft <= 0) && !onGoing || ongGoingOpt){
                  resolveData = sessionId;
                }else{
                  resolveData = false;
                }
                if(!!resolveData && returnTimeLeft){
                  resolveData = timeLeft;
                }
                return Promise.resolve(resolveData);
              }else{
                return Promise.reject(2);
              }
            })
        }else{
          return Promise.reject(3);
        }
      })
      .catch(err => {
        return Promise.reject(err);
      })
  }
}

async function creditTransactionPayment(transactionId){
  const transactionLogs = await loadCollections('Transaction_Log');

  await transactionLogs
    .findOne({
      '_id': transactionId
    })
    .then(async result => {
      let resultData = await result;
      if(resultData){
        let amount = resultData.amount;

        console.log(amount);
      }
    })
}

module.exports = router;