const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const ObjectID = require('mongodb').ObjectID;

const baseFee = 5;
const succeedingRateHour = 3;

const router = express.Router();

router.get('/rfid/auth', async (req, res) => {
  const rfid_cards = db.collection('RFID_Card');


  const serial_id = parseInt(req.body.serial_id || req.query.serial_id) || null;
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

        if(!!data){
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
          res.status(401).send(body);
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

router.post('/login', async (req, res) => {
  const users = db.collection('Student_DB');
  const rentalInfos = db.collection('Rental_Unit_Info');

  const idNum = parseInt(req.body.id_num || req.query.id_num);
  const password = req.body.password || req.query.password;

  let body = {};
  let hasRental = false;

  await users
    .findOne({
      id_num: idNum,
      password: password
    })  
    .then(result => {
      if(result){
        const payload = {
          'id_num': idNum
        };
        const token = jwt.sign(payload, config.secret, {
          expiresIn: '4hr' // expires in 24 hours
        });

        return Promise.resolve(token);
        
      }else {
        return Promise.reject(1);
      }
    })
    .then(async token => {

      await rentalInfos
        .findOne({
          user_num: idNum
        })
        .then(result => {
          if(result){
            hasRental = true;
          }else{
            hasRental = false;
          }
        })

      body.constructBody({
        authorized: true,
        hasRental,
        token
      });

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
          case 1:
            body.constructError(4, `Invalid login credentials.`);
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })
})

router.get('/esp-test', async (req, res) => {
  console.log('connection success');
  res.status(200).send('{SESSION,1,ADD,123456789,1234567890;}');
});

router.post('/esp-test', async (req, res) => {
  let body = req.body.data || req.query.data;
  console.log('connection success', typeof body);
  res.status(200).send(JSON.stringify({'data': body}));
});

router.post('/area/gateway', async (req, res) => {
  const unitActivities = db.collection('Unit_Activity_Logs');
  const lockerUnits = db.collection('Locker_Units');
  const rentalInfos = db.collection('Rental_Unit_Info');
  const rfidCards = db.collection('RFID_Card');

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
    let totalAmount = calculateFee(hours);
    body.success = true;
    body.data = totalAmount;
    res.send(body);
  }else{
    body.constructError(01, 'Hours parameter is required.');
    res.send(body);
  }
});

router.use((req, res, next) => {
  // const token = req.body.token || req.query.token || req.headers['x-access-token'];
  const token = getToken(req);

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

getToken = function (req) {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') { // Authorization: Bearer g1jipjgi1ifjioj
    // Handle token presented as a Bearer token in the Authorization header
    return req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    // Handle token presented as URI param
    return req.query.token;
  } else if (req.cookies && req.cookies.token) {
    // Handle token presented as a cookie parameter
    return req.cookies.token;
  }
  // If we return null, we couldn't find a token.
  // In this case, the JWT middleware will return a 401 (unauthorized) to the client for this request
  return null; 
}



module.exports = router;