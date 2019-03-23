const express  = require('express');
const fetch    = require('node-fetch');
const ObjectID = require('mongodb').ObjectID;

const router = express.Router();

router.get('/transaction/summary', async (req, res) => {
  const transactionLogs = await loadCollections('Transaction_Log');

  const query = req.query;
  const reqBody = req.body;

  const start_date = parseInt(query.start_date || reqBody.start_date);
  const end_date = parseInt(query.end_date || reqBody.end_date);
  const page_cursor = parseInt(query.page_cursor || reqBody.page_cursor) || 1;
  const page_size = parseInt(query.page_size || reqBody.page_size) || 0;
  const skip_items = (page_cursor - 1) * page_size;

  let body = {};

  await transactionLogs
    .find({
      $and: [{
        'date': {
          $gte: start_date
        }
      },{
        'date': {
          $lte: end_date
        }
      }]
    }, {
      projection: {'_id': 0}
    })
    .skip(skip_items)
    .limit(page_size)
    .toArray()
    .then(result => {
      body.data = result;
      body.success = true;
      res.send(body);
    })
    .catch(err => {
      body.constructError(2, err);
      console.error(err);
      res.send(body);
    })
})

router.get('/transaction/college', async (req, res) => {
  let token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZF9udW0iOjE0MjE2MTUsImlhdCI6MTU0OTc2NTkzNSwiZXhwIjoxNTQ5NzgwMzM1fQ.B5luDm0haW4Q1lpJ_ZPkFtOulLeNa07AEfc-aoxWR60";
  let body = {
    data: {},
    colleges: [],
    success: null
  };

  await fetch(`http://${serverUrl}:${5000}/stats/transaction/summary?start_date=1549357202&end_date=1549368002&page_cursor=0&page_size=0&token=${token}`, {
    method: 'GET',
    body: null,
    headers: {
      'Content-Type': 'x-www-form-urlencoded'
    }
  })
  .then(async result => {
    if(result){
      let data = await result.json();

      if(data.success){
        let transactionData = data.data;

        return Promise.resolve(transactionData);
      }else{
        body.constructError(02, data.data);
      }
    }else{
      return Promise.reject('No transaction logs.');
    }
  })
  .catch(err => {
    console.log(err);
    res.send(err);
  })
  .then(async data => {
    var promises = [];

    for(let i = 0; i < data.length; i++){
      let log = data[i];

      promises.push(mapTransaction(log));
    }

    async function mapTransaction(log){
      return await fetch(`http://${serverUrl}:${5000}/user/profile?student_id=${log.user_num}&token=${token}`, {
        method: 'GET',
        body: null,
        headers: {
          'Content-Type': 'x-www-form-urlencoded'
        }
      })
      .then(async result => {
        let data = await result.json();
        if(data.success){
          return Promise.resolve(data.data.college);
        }else{
          return Promise.reject('User not found.');
        }
      })
      .catch(err => {
        console.log(err);
      })
      .then(userCollege => {  
        let logType = log.type;
        college = userCollege;

        let transaction = {
          'amount': log.amount,
          'college': college
        }
        return Promise.resolve(transaction);
      })
      .catch(err => {
        return Promise.reject(err);
      })
    }

    await Promise.all(promises).then(async (transactions) => {
      let colleges = {};
      let totalShares = 0;

      body.data.raw = transactions;

      for(let i = 0; i < transactions.length; i++){
        thisTransaction = transactions[i];
        thisCollege = colleges[thisTransaction.college];
        
        try{
          colleges[thisTransaction.college].amount += thisTransaction.amount;
          colleges[thisTransaction.college].transactions++;
          totalShares++;
        }catch(e){
          colleges[thisTransaction.college] = {};
          colleges[thisTransaction.college].amount = 0;
          colleges[thisTransaction.college].transactions = 0;
          totalShares++;
          colleges[thisTransaction.college].shares = 0;
          colleges[thisTransaction.college].amount += thisTransaction.amount;
          colleges[thisTransaction.college].transactions++;
        }
      }

      Object.keys(colleges).forEach(college => {
        let thisCollege = colleges[college];

        colleges[college].shares = thisCollege.transactions/totalShares;
      });

      body.colleges = colleges;

      body.success = true;
      res.send(body);
   })
   .catch(err => {
     console.error(err);
     res.send(err);
   })
  })
});

router.get('/overdue-threshold', async (req, res) => {
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const sessionLogs = await loadCollections('Session_Log');

  const currTime = Math.floor((new Date).getTime()/1000);

  const isOverThreshold = req.query.over_threshold || req.body.over_threshold || null;

  !isOverThreshold ? body.constructError(1, `Over threshold parameter is required.`) : null;

  let body = {};

  await rentalInfos
    .find({
      'mode': 'occupied'
    })
    .toArray()
    .then(async results => {
      if(!!results){
        let rentalInfo = results;
        let overdueUserPromises = [];

        rentalInfo.forEach(async rental => {
          overdueUserPromises.push(filterOverdueUsers(rental.session_id))
        })

        return await Promise.all(overdueUserPromises.map(p => p.catch((err) => err)))
          .then(users => {
            let reducedUsers = [];
            for(let i = 0; i < users.length; i++) if(!!users[i]) reducedUsers.push(users[i]);

            return Promise.resolve(reducedUsers);
          })
      }else{
        return Promise.resolve();
      }
    })
    .then(users => {
      if(!!users){
        return Promise.resolve(users);
      }else{
        return Promise.resolve();
      }
    })
    .then(overdueArr => {
      body.constructBody(overdueArr);

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
          case 1:
            body.constructError(4, `Session not found for this rental.`);
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })

    async function filterOverdueUsers(sessionID) {
      return await verifyObjectId(sessionID)
        .then(async id => {
          return await sessionLogs
            .findOne({
              '_id': id
            })
        })
        .then(async sessionData => {
          if(!!sessionData){
            const endTime = sessionData.end_date;

            let overThreshold = false;

            if(isOverThreshold === 'true'){
              overThreshold = true;
            }else{
              overThreshold = false;
            }

            return await isTimeAuth(currTime, endTime, false, overThreshold)
              .then(async isAuth => {
                if(isAuth){
                  const students = await loadCollections('Student_DB');

                  const unitNum = sessionData.unit_num;
                  const userNum = sessionData.user_num; 

                  let timeSince = endTime - currTime;
                  timeSince *= -1;

                  if(overThreshold){
                    const thresholdTime = 60*60*24*5 // TODO: Save in global variable // 5 days

                    timeSince -= thresholdTime;
                  }

                  return await students
                    .findOne({
                      'id_num': userNum
                    })
                    .then(result => {
                      if(!!result){
                        let student = result;
                        let userFirstName = capitalizeFirstLetter(student.first_name);
                        let userLastName = capitalizeFirstLetter(student.last_name);

                        let userData = {
                          name: {
                            first_name: userFirstName,
                            last_name: userLastName,
                            suppressed_name: `${userFirstName} ${userLastName[0]}.`
                          },
                          time_since: timeSince,
                          unit_num: unitNum
                        };
      
                        return Promise.resolve(userData);
                      }else{
                        console.error('Student record not found.');
                        return Promise.reject(0);
                      }
                    })
                }else{
                  return Promise.resolve(false);
                }
              })
              .catch(err => {
                if(err == 1) return Promise.reject(2);
                return Promise.reject(err);
              })
          }else{
            return Promise.reject(1);
          }
        })
        .catch(err => Promise.reject(err));
    }
})

router.get('/rental-shares', async (req, res) => {
  const unitActivities = await loadCollections('Unit_Activity_Logs');

  await unitActivities
    .aggregate([
      {$match: {}},
      {$group: {
        '_id': '$session_id',
        types: {
          $push: '$type'
        }
      }}
    ])
    .toArray()
    .then(results => {
      console.log(results);

      res.send(results);
    })
    .catch(err => {
      console.error(err);
      res.send(err);
    })

})

async function getSessionMetaInfo(){

}


module.exports = router;