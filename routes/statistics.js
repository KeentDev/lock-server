const express = require('express');
const fetch = require('node-fetch');
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

router.get('/overdue-list', async (req, res) => {
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const sessionLogs = await loadCollections('Session_Log');
  const currTime = Math.floor((new Date).getTime()/1000);
  const page_cursor = req.body.page_cursor || req.query.page_cursor || 1;
  const page_size = req.body.page_size || req.body.page_size || 0;
  const skip_items = (page_cursor - 1) * page_size;

  let body = {};
  let overduePromises = [];

  await rentalInfos
    .find({
      'mode': 'occupied'
    })
    .skip(skip_items)
    .limit(page_size)
    .toArray()
    .then(async results => {
      if(results){
        results.forEach(async result => {
          overduePromises.push(getOverdueStudents(result.session_id));
        })
        return Promise.resolve(results);
      }else{
        body.data = [];
        body.success = true;

        res.send(body);
        return Promise.reject();
      }
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(err);
    })
    .then(async results => {
      await Promise.all(overduePromises)
        .then(async overdues => {
          let overdueStudents = overdues.filter(student => {
            return student != false;
          })
          let students = [];

          overdueStudents.forEach(student => {
            students.push({'user_num': student.user_num, 'end_time': student.end_time})
          })

          body.data = students;
          body.success = true;

          res.send(body);
        })
        .catch(err => {
          res.send(err);
        })
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(body);
    })
  
  async function getOverdueStudents(sessionId){
    return await sessionLogs
      .findOne({
        '_id': new ObjectID(sessionId)
      })
      .then(session => {
        if(session){
          let end_time = session.end_date;
          let studentId = session.user_num;

          if(currTime > end_time){
            return Promise.resolve({'user_num': studentId, 'end_time': end_time});
          }else{
            return Promise.resolve(false);
          }
        }else{
          body.constructError(02, 'Session not found.');
          return Promise.reject();
        }
      })
      .catch(err => {
        body.constructError(02, 'Session not found.');
        return Promise.reject();
      })
  }

});

module.exports = router;