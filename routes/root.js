const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const ObjectID = require('mongodb').ObjectID;

const baseFee = 5;
const succeedingRateHour = 3;


const router = express.Router();

router.post('/rfid/auth', async (req, res) => {
  const rfid_cards = await loadCollections('RFID_Card');

  const serial_id = parseInt(req.query.serial_id || req.body.serial_id) || null;
  const body = {};

  if(serial_id){
    await rfid_cards
      .findOne({
        'serial_id': serial_id
      }, {
        'projection': {
          '_id': 0
        }
      })
      .then(data => {
        let body = {};
        let bodyData = {};
        if(data){
          if (data.length <= 0) {
            body.constructError(00, `Found no card information available on Serial ID #${serial_id}.`);
            res.send(body);
          } else {
            const payload = {
              'id_num': data.id_num
            };
  
            const token = jwt.sign(payload, config.secret, {
              expiresIn: '4hr' // expires in 24 hours
            });
  
            bodyData.token = token;
  
            body.data = bodyData;
            body.success = true;
  
            res.send(body);
          }
        }else{
          body.constructError(00, `Found no card information available on Serial ID #${serial_id}.`);
          res.send(body);
        }
        
      })
      .catch(err => {
        body.constructError(02, err);
        res.send(err);
      });
  }else{
    body.constructError(01, 'A Serial ID parameter is required.');
    res.send(body);
  }
  
});

router.get('/esp-test', async (req, res) => {
  console.log('connection success');
  res.status(200).send('test');
});

router.post('/esp-test', async (req, res) => {
  let body = req.body.data || req.query.data;
  console.log('connection success', typeof body);
  res.status(200).send(JSON.stringify({'data': body}));
});

router.post('/area/gateway', async (req, res) => {
  const unitActivities = await loadCollections('Unit_Activity_Logs');
  const lockerUnits = await loadCollections('Locker_Units');
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const rfidCards = await loadCollections('RFID_Card');

  const currTime = Math.floor((new Date).getTime()/1000);

  const payload = req.query.payload || null;

  if(payload){
    let sessionData = payload.split(',');
    let isAuthorized = true;
    let type = 'usage';
    let slaveAddr = parseInt(sessionData[1]);
    let serialID = sessionData[2];

    await Promise.all([
      getUnitNum(),
      getUserNum(),
      isAuth()
    ])
      .then(async numID => {
        let unitNum = await numID[0];
        let userNum = await numID[1];
        let isAuth = await numID[2];

        await rentalInfos.findOne({
          'unit_num': unitNum,
          'user_num': userNum
        })
        .then(async result => {
          console.log(userNum);
          if(await result){
            let sessionID = result.session_id;

            await getCurrentSessionMatchId(userNum, unitNum, true, true)
              .then(async timeLeft => {
                if(!!timeLeft){
                  let overdueTime = 432000; // 5 days
                  if((timeLeft * -1) >= overdueTime){
                    apiCodes.push(1);
                    console.error("Overdue for 5 days");

                    await unitActivities.insertOne({
                      'type': type,
                      'date': currTime,
                      'authorized': isAuthorized,
                      'authenticated': false,
                      'session_id': sessionID
                    })
                    .then(result => {
                      if(result.result.ok){
                        res.send(`UNLOCK_NOTAUTH,${slaveAddr},${serialID}`);
                      }else{
                        return Promise.reject("Cannot add unit activity log");
                      }
                    })
                    .catch(err => {
                      console.error(err);
                      res.send(`UNLOCK_NOTAUTH,${slaveAddr},${serialID}`);
                    })
                  }
                  await unitActivities.insertOne({
                    'type': type,
                    'date': currTime,
                    'authorized': isAuthorized,
                    'authenticated': isAuth,
                    'session_id': sessionID
                  })
                  .then(result => {
                    if(result.result.ok){
      
                      res.send(payload);
                    }else{
                      console.error();
                      return Promise.reject("Cannot add unit activity log");
                    }
                  })
                }else{
                  console.error(timeLeft);
                  return Promise.reject("Not a valid time");
                }
              })
              .catch(err => {
                let errMsg;
                switch (err) {
                  case 1:
                    errMsg = 'Invalid Session ID format from rental record.'
                    break;
                  case 2:
                    errMsg = 'Session record does not exist.'
                    break;
                  case 3:
                    errMsg = 'Rental session does not exist.'
                    break;
                  default:
                    errMsg = err;
                    break;
                }
                return Promise.reject(errMsg);
              })
          }else{
            await unitActivities.insertOne({
                'type': type,
                'date': currTime,
                'authorized': isAuthorized,
                'authenticated': false,
                'session_id': null
              })
              .then(result => {
                if(result.result.ok){
                  console.error('Not auth');
                  res.send(`UNLOCK_NOTAUTH,${slaveAddr},${serialID}`);
                }else{
                  return Promise.reject("Cannot add unit activity log");
                }
              })
              .catch(err => {
                console.error(err);
                res.send(`UNLOCK_NOTAUTH,${slaveAddr},${serialID}`);
              })
            return Promise.reject("Rental info not found");
          }
        })
        .catch(err => {
          return Promise.reject(err);
        })
      })
      .catch(async err => {
        if(err == sessionData[0]){

          await unitActivities.insertOne({
            'type': type,
            'date': currTime,
            'authorized': isAuthorized,
            'authenticated': false,
            'session_id': null
          })
          .then(result => {
            if(result.result.ok){
              console.error('Not auth');
              res.send(`UNLOCK_NOTAUTH,${slaveAddr},${serialID}`);
            }else{
              console.error();
              return Promise.reject("Cannot add unit activity log");
            }
          })
          .catch(err => {
            console.error(err);
            res.send(`UNLOCK_NOTAUTH,${slaveAddr},${serialID}`);
          })
        }else{
          console.error(err);
        }
        res.send(`UNLOCK_NOTAUTH,${slaveAddr},${serialID}`);
      })

    async function getUnitNum(){
      return await lockerUnits.findOne({
          'slave_address': parseInt(slaveAddr)
        })
        .then(async result => {
          if(result){
            let unitNum = await result.unit_number;
            
            return Promise.resolve(parseInt(unitNum));
          }else{
            return Promise.reject("Unit not found");
          }
        })
        .catch(err => {
          return Promise.reject(err);
        })
    }

    async function getUserNum(){
      return await rfidCards.findOne({
          'serial_id': parseInt(serialID)
        })
        .then(async result => {
          if(result){
            return Promise.resolve(parseInt(result.id_num));
          }else{
            return Promise.reject("User not found");
          }
        })
        .catch(err => {
          return Promise.reject(err);
        })
    }

    async function isAuth(){
      switch(sessionData[0]){
        case 'UNLOCK':
          // isAuthenticated = true;
          return Promise.resolve(true);
        case 'UNLOCK_NOTAUTH':
          // isAuthenticated = false;
          return Promise.reject(sessionData[0]);
        default:
          return Promise.reject("Not a valid session mode");
      }
    }
  }else{
    console.error("Payload parameter is required.");
    res.send("Payload parameter is required.");
  }
  
  
});

router.get('/fee/calculation', async (req, res) => {
  const hours = parseInt(req.query.hours) || null;

  let body = {};

  if(hours){
    let totalAmount = baseFee + (hours*succeedingRateHour);
    body.success = true;
    body.data = totalAmount;
    res.send(body);
  }else{
    body.constructError(01, 'Hours parameter is required.');
    res.send(body);
  }
});

router.use((req, res, next) => {
  const token = req.body.token || req.query.token || req.headers['x-access-token'];

  let body = {};

  if(token) {
    jwt.verify(token, config.secret, (err, decoded) => {
      if(err) {
        body.constructError(05, 'Failed to authenticate.');
        return res.send(body);
      }else {
        req.decoded = decoded;
        next();
      }
    })
  }else {
    body.constructError(01, 'Please encode a valid token');

    return res.status(403).send(body);
  }


});

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
            console.error(err);
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


module.exports = router;