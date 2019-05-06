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

router.get('/list', async (req, res) => {
  const users = db.collection('Student_DB');

  const payload = req.body;

  const page_cursor = payload.page_cursor || 1;
  const page_size = payload.page_size || 0;
  const skip_items = (page_cursor - 1) * page_size;

  let body = {};

  await users
    .find({}, {
      projection: {
        'password': 0,
      }
    })
    .map((user) => {
      return {
        'name': {
          'first_name': user.first_name,
          'last_name': user.last_name
        },
        'student_id': user.id_num,
        'user_id': user._id
      }
    })
    .skip(skip_items)
    .limit(page_size)
    .toArray()
    .then(data => {
      let body = {};

      body.data = data;
      body.success = true;

      res.send(body);
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(body);
    });
});
    
router.get('/profile', async (req, res) => {
  const users = db.collection('Student_DB');
  const studentId = parseInt(req.decoded.id_num) || null;
  const userId = parseInt(req.body.user_id || req.query.user_id) || null;
  const rentalInfos = db.collection('Rental_Unit_Info');
  const sessionLogs = db.collection('Session_Log');

  let body = {};

  fetchProfile = async () => {
    return new Promise(async (resolve, reject) => {
      if (studentId) {
        await users.findOne({
            'id_num': studentId
          }, {
            projection: {
              '_id': 0,
              'password': 0
            }
          })
          .then(data => {
            if (data) {
              body.data = data;
              body.success = true;
            } else {
              body.constructError(00, `Student ID #${studentId} not found.`);
            }

            resolve(body);
          })
          .catch(err => {
            body.constructError(02, err);
            resolve(body);
          })

      } else if (userId) {
        verifyObjectId(userId)
          .then(async id => {
            return new Promise(async (resolve, reject) => {
              await users.find({
                  '_id': id
                }, {
                  projection: {
                    '_id': 0,
                    'password': 0
                  }
                })
                .toArray()
                .then(data => {
                  resolve(data)
                })
                .catch(err => {
                  body.constructError(02, err);
                  resolve(body);
                })
            });
          })
          .catch(err => {
            console.error(err);
            body.constructError(03, `Please encode a valid User ID format and value.`);
            resolve(body);
          })
          .then(data => {
            if (data.length > 0) {
              body.data = data;
              body.success = true;
            } else {
              body.constructError(00, `User ID ${userId} not found.`);
            }
            resolve(body);
          })
          .catch(err => {
            body.constructError(02, err);
            resolve(body);
          });
      } else {
        body.constructError(02, `User ID or Student ID is required for querying a user profile.`);
        resolve(body);
      }
    });
  }

  fetchProfile()
    .then(async body => {
      let rentalBody = {};
      
      rentalBody = await rentalInfos
        .findOne({
          user_num: studentId
        })
        .then(async rentalInfos => {
          if(!!rentalInfos){
            let sessionId = rentalInfos.session_id;

            return await verifyObjectId(sessionId)
              .then(async id => {
                return await sessionLogs
                  .findOne({
                    _id: id
                  })
                  .then(sessionLog => {
                    return Promise.resolve({
                      hasRental: true,
                      start: sessionLog.start_date,
                      end: sessionLog.end_date,
                      unit_num: sessionLog.unit_num,
                      unit_area: rentalInfos.unit_area
                    })
                  })
              })
          }else {
            return Promise.resolve({
              hasRental: false
            });
          }
        })

      body.rental = await rentalBody;

      res.send(body);
    })
    .catch(err => {
      console.error(err);
    })

});

router.get('/rental-info', async (req, res) => {
  const rentalInfos = db.collection('Student_Unit_Info');
  const userId = req.body.user_id || null;
  const unitId = req.body.unit_id || null;

  let body = {};

  if (userId && unitId) {
    body.constructError(01, 'Only either User ID or Unit ID can be a query, NOT both.');
    res.send(body);
  } else if (userId) {
    verifyObjectId(userId)
      .then(async id => {
        await rentalInfos
          .find({
            'user_id': userId
          }, {
            projection: {
              '_id': 0,
            }
          })
          .toArray()
          .then(data => {
            let body = {};

            if (data.length <= 0) {
              body.constructError(00, `Found no rental information available on user ID ${userId}.`);
            } else {
              body.data = data;
              body.success = true;
            }

            res.send(body);
          })
          .catch(err => {
            body.constructError(02, err);
            res.send(body);
          });
      })
      .catch(err => {
        console.error(err);
        body.constructError(03, `Please encode a valid User ID format and value.`);
        res.send(body);
      });

  } else if (unitId) {
    verifyObjectId(unitId)
      .then(async id => {
        await rentalInfos
          .find({
            'unit_id': unitId
          }, {
            projection: {
              '_id': 0,
            }
          })
          .toArray()
          .then(data => {
            let body = {};

            if (data.length <= 0) {
              body.constructError(00, `Found no rental information available on unit ID ${unitId}.`);
            } else {
              body.data = data;
              body.success = true;
            }

            res.send(body);
          })
          .catch(err => {
            body.constructError(02, err);
            res.send(body);
          });
      })
      .catch(err => {
        console.error(err);
        body.constructError(03, `Please encode a valid Unit ID format and value.`);
        res.send(body);
      });
  } else {
    body.constructError(01, 'A User ID or Unit ID parameter is required.');
    res.send(body);
  }

});

router.get('/do/list', async (req, res) => {
  const officersCollection = db.collection('Discipline_Officers');

  let body = {};

  const page_cursor = req.body.page_cursor || req.query.page_cursor || 1;
  const page_size = req.body.page_size || req.query.page_size || 0;
  const skip_items = (page_cursor - 1) * page_size;


  await officersCollection
    .find({})
    .skip(skip_items)
    .limit(page_size)
    .toArray()
    .then(officers => {

      for (let i = 0; i < officers.length; i++) {
        officers[i].ObjectKeyMapper('_id', 'user_id');
        officers[i].ObjectKeyMapper('id_num', 'officer_id');
      }

      body.data = officers;
      body.success = true;

      res.send(body);
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(body);
    });
})

router.get  ('/do/profile', async (req, res) => {
  const officersCollection = db.collection('Discipline_Officers');

  let officerId = req.body.officer_id || null;
  let userId = req.body.user_id || null;
  let body = {};

  if(officerId && userId){
    body.constructError(01, 'Only either User ID or Officer ID can be a query, NOT both.');
    res.send(body);
  } else if (officerId) {
    verifyObjectId(officerId)
      .then(async id => {
        await officersCollection
        .find({
          "id_num": officerId
        })
        .toArray()
        .then(data => {
          verifyOfficer(data, 'Officer', officerId);
        })
        .catch(err => {
          body.constructError(02, err);
          res.send(body);
        });
      })
      .catch(err => {
        body.constructError(03, `Please encode a valid Officer ID format and value.`);
        res.send(body);
      })
  } else if(userId) {
    verifyObjectId(userId)
      .then(async id => {
        await officersCollection
        .find({
          "_id": id
        })
        .toArray()
        .then(data => {
          verifyOfficer(data, 'User', userId);
        })
        .catch(err => {
          body.constructError(02, err);
          res.send(body);
        });
      })
      .catch(err => {
        body.constructError(03, `Please encode a valid User ID format and value.`);
        res.send(body);
      })
  } else {
    body.constructError(01, 'Please encode only either User ID or Officer ID can be a query, NOT both.');
    res.send(body);
  }

  function verifyOfficer(data, label, id) {
    if (data.length > 0) {
      let officerData = data[0];
      officerData.ObjectKeyMapper('_id', 'user_id');
      officerData.ObjectKeyMapper('id_num', 'officer_id');
      body.data = officerData;
      body.success = true;
    } else {
      body.constructError(00, `${label} with ID ${id} is not found.`);
    }

    res.send(body);
  }
})
  
router.get('/rental-logs', async (req, res) => {
  const unitActivities = db.collection('Unit_Activity_Logs');
  const sessionLogs = db.collection('Session_Log');

  const userNum = req.body.user_num || req.query.user_num || null;
  const page_cursor = req.body.page_cursor || req.query.page_cursor || 1;
  const page_size = req.body.page_size || req.body.page_size || 0;
  const skip_items = (page_cursor - 1) * page_size;

  let body = {};
  let sessionPromises = [];

  !userNum ? body.constructError(1, `Student ID parameter is required.`) : null;

  if(!userNum){
    res.send(body);
  }else{
    await sessionLogs
      .find({
        'user_num': userNum
      })
      .skip(skip_items)
      .limit(page_size)
      .toArray()
      .then(async sessions => {
        if(sessions){
          sessions.forEach(session => {
            session.ObjectKeyMapper('_id', 'session_id');
            sessionPromises.push(getSessionRentalInfos(session.session_id.toString()));
          })
        }else{
          body.data = 'No session for this user.';
          body.success = false;
          res.send(body);
          return Promise.reject('No session for this user.');
        }

        await Promise.all(sessionPromises)
          .then(async sessionActivities => {
            body.data = sessionActivities;
            body.success = true;

            res.send(body);
          })
          .catch(err => {
            switch(err){
              case 1:
                body.data = 'No rental activities found for this session.';
                body.success = false;
                break;
              default:
                body.constructError(02, err);
                break;
            }
            res.send(body);
          })
      })
      .catch(err => {
        body.constructError(02, err);
        res.send(body);
      })
  }

  async function getSessionRentalInfos(sessionId){
    return await unitActivities
      .find({
        'session_id': sessionId
      })  
      .toArray()
      .then(activities => {
        if(activities){
          activities.forEach(activity => {
            activity.ObjectKeyMapper('_id', 'activity_id');
          });
          return Promise.resolve(activities);
        }else{
          return Promise.reject(1);
        }
      })
      .catch(err => {
        console.error(err);
        return Promise.reject(err);
      })
  }
})

router.get('/transaction-logs', async (req, res) => {
  const currTime = Math.floor((new Date).getTime()/1000);
  const transactionLogs = db.collection('Transaction_Log');
  const sessionLogs = db.collection('Session_Log');
  const unitActivities = db.collection('Unit_Activity_Logs');
  const rentalInfos = db.collection('Rental_Unit_Info');

  const userNum = req.body.user_num || req.query.user_num || null;
  const page_cursor = req.body.page_cursor || req.query.page_cursor || 1;
  const page_size = parseInt(req.body.page_size || req.body.page_size || 0);
  const skip_items = (page_cursor - 1) * page_size;

  let body = {};
  let sessionPromises = [];

  !userNum ? body.constructError(1, `Student ID parameter is required.`) : null;

  if(userNum){
    await sessionLogs
      .find({
        'user_num': userNum
      })
      .skip(skip_items)
      .limit(page_size)
      .toArray()
      .then(async sessions => {
        if(sessions){
          sessions.forEach(session => {
            session.ObjectKeyMapper('_id', 'session_id');
            sessionPromises.push(getSessionTransactionLogs(session.session_id.toString()));
          })
        }else{
          body.data = 'No session for this user.';
          body.success = false;
          res.send(body);
          return Promise.reject('No session for this user.');
        }

        await Promise.all(sessionPromises)
          .then(async sessionTransactions => {
            let transactionObj = {};
            for(let i = 0; i < sessionTransactions.length; i++){
              let thisSession = sessions[i];
              let sessionId = thisSession.session_id.toString();
              let isOverdue = false;
              let endTime = thisSession.end_date;

              await isOccupied(sessionId)
                .then(occupied => {
                  if(occupied && (currTime > endTime)){
                    isOverdue = true;
                  }else{
                    isOverdue = false;
                  }
                  transactionObj[sessionId] = {};
                  transactionObj[sessionId]['data'] = sessionTransactions[i];
                  transactionObj[sessionId]['meta'] = { 'overdue': isOverdue };
                })
                .catch(err => {
                  return Promise.reject(err);
                })
            }
            body.data = transactionObj;
            body.success = true;

            res.send(body);

            async function isOccupied(sessionId){
              return await rentalInfos
                .findOne({
                  'session_id': sessionId
                })
                .then(rental => {
                  if(rental){
                    if(rental.mode == 'occupied'){
                      return Promise.resolve(true);
                    }else{
                      return Promise.resolve(false);
                    }
                  }else{
                    return Promise.resolve(false);
                  }
                })
                .catch(err => {
                  return Promise.reject(err);
                })
            }
            return Promise.resolve();
          })
          .catch(err => {
            body.constructError(2, err);
            res.send(body);
          })
      })
      .catch(err => {
        body.constructError(2, err);
        res.send(body);
        return Promise.resolve();
      })
  }else{
    res.send(body);
  }

  async function getSessionTransactionLogs(sessionId){
    return await unitActivities
      .find({
        'type': {
          $in: ['rent_auth', 'extend_auth', 'overdue_auth']
        },
        'session_id': sessionId
      })  
      .toArray()
      .then(async activities => {
        let activityPromises = [];
        
        if(activities){
          activities.forEach(async activity => {
            activityPromises.push(getTransactions(activity._id.toString()));
          })

          return await Promise.all(activityPromises)
            .then(async transactionResult => {
              return Promise.resolve(transactionResult);
            })
            .catch(err => {
              return Promise.reject(err);
            });
        }else{
          return Promise.reject(1);
        }

        async function getTransactions(activityId){
          return await transactionLogs
            .find({
              'activity_log_id': activityId
            }, {
              projection: {
                'activity_log_id': 0,
                'user_num': 0
              }
            })
            .toArray()
            .then(transaction => {
              if(transaction){
                if(transaction.length > 1){
                  return Promise.reject(3);
                }else{
                  let thisTransaction = transaction[0];
                  thisTransaction.ObjectKeyMapper('_id', 'transaction_id');
                  if([activityObj.RENT_AUTH, activityObj.EXTEND_AUTH, activityObj.OVERDUE_AUTH]
                    .includes(thisTransaction.type)
                    ){
                    thisTransaction.type = thisTransaction.type.replace('_auth', '');
                  }else{
                    return Promise.reject(4);
                  }
                  return Promise.resolve(thisTransaction);
                }
              }else{
                return Promise.reject(2);
              }
            })
        }
      })
      .catch(err => {
        let errorMsg;
        switch(err){
          case 1:
            errorMsg = 'No session for this user.';
            break;
          case 2:
            errorMsg = 'Transaction not found for this activity.';
            break;
          case 3:
            errorMsg = 'Multiple transactions on same activity has occured.';
            break;
          case 4:
            errorMsg = 'Transaction type is not a valid auth type.';
            break;
          default:
            errorMsg = err;
            break;
        }
        return Promise.reject(errorMsg);
      })
  }
})

router.get('/search', async (req, res) => {
  const students = db.collection('Student_DB');

  const userNum = req.body.user_num || req.query.user_num || null;
  const userName = req.body.user_name || req.query.user_name || null;

  let body = {};

  if(userNum || userName){
    await students
      .find({
        'id_num': userNum
      })
      .toArray()
      .then(students => {
        if(students){
          if(students.length > 1){
            return Promise.reject(1);
          }else{
            let thisStudent = students[0];
            res.send(thisStudent);
          }
        }else{
          body.constructError(00, `Student ID #${userNum} not found.`);
          return Promise.reject();
        }
      })
      .catch(err => {
        let errorMsg;

        switch(err){
          case 1:
            errorMsg = 'There are multiple student instances on the same Student ID.';
            break;
          case 2:
            body.constructError(1, err);
            break;
        }
      });
  }else{
    !userNum ? body.constructError(1, `Student ID or Student name parameter is required.`) : null;
    res.send(body);
  }
});


module.exports = router;