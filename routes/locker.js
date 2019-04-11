const express = require('express');

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
          body.constructError(0, `Area number #${area} not found.`);
        }

        res.send(body);
      })
      .catch(err => {
        body.constructError(2, err);
        res.send(body);
      })
  } else {
    body.constructError(1, 'Area number parameter is required.');
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
      body.constructError(2, err);
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
            body.constructError(0, `Found no information available on area ID ${id}.`);
            return Promise.reject();
          }
        })
        .catch(err => {
          body.constructError(2, err);
          return Promise.reject();
        })
      })
      .catch(err => {
        console.error(err);
        body.constructError(3, `Please encode a valid Area ID format and value.`);
        console.log(body)
        res.send(body);
        return Promise.resolve();
      });
  }else{
    body.constructError(1, 'Area ID parameter is required.');
    res.send(body);
  }
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
          body.constructError(0, `No available locker units on Area #${area}.`);
        }

        res.send(body);
      })
      .catch(err => {
        body.constructError(2, err);
        res.send(body); 
      })
  }else{
    body.constructError(1, 'Area number parameter is required.');
    res.send(body);
  }

});

router.post('/transaction/authorization', async (req, res) => {
  const currTime = Math.floor((new Date).getTime()/1000);
  const unitActivities = await loadCollections('Unit_Activity_Logs');
  const sessionLogs = await loadCollections('Session_Log');

  const unitNum = parseInt(req.body.unit_num) || parseInt(req.query.unit_num) || null;
  const userNum = req.decoded.id_num || null;
  const transactionType = req.body.transaction_type || req.query.transaction_type || null;

  let body = {};

  !userNum ? body.constructError(1.2, `User Id parameter is required.`) : null;
  !unitNum ? body.constructError(1.1, `Unit Id parameter is required.`) : null;

  let transActivityType = null;

  let transAuth = async (userNum, unitNum) => {
    if(!userNum || !unitNum){
      return Promise.reject(-1)
    }

    if(transactionType == 'rent'){
      transActivityType = activityObj.RENT_AUTH;

      return await getCurrentSessionID(userNum, unitNum)
        .then(async sessionId => {
          return await unitActivities
            .find({
              'session_id': sessionId
            })
            .toArray()
        })
        .then(async activities => {
          let recentActivity = activities[activities.length - 1];
          
          if(!!recentActivity){
            if(recentActivity.type === activityObj.RESERVE_SESSION){
              if(recentActivity.authenticated){
                return await newRentalSession(userNum, unitNum, true);
              }else{
                return Promise.reject(8);
              }
            }else{
              return Promise.reject(7)
            }
          }else{
            return Promise.reject(6);
          }
        })
        .catch(async err => {
          if(err == 2){
            return await newRentalSession(userNum, unitNum);
          }else{
            return Promise.reject(err);
          }
        });
    }else if(transactionType == 'overdue'){
      transActivityType = activityObj.OVERDUE_AUTH;
        
      return await getCurrentSessionID(userNum, unitNum, false)
        .catch(err => {
          if(err == 1){
            return Promise.reject(3);
          }else{
            return Promise.reject(err);
          }
        })
    }else if(transactionType == 'extend'){
      transActivityType = activityObj.EXTEND_AUTH;

      return await getCurrentSessionID(userNum, unitNum, true)
        .catch(err => {
          if(err == 1){
            return Promise.reject(4);
          }else{
            return Promise.reject(err);
          }
        })
    }else if(transactionType == 'reserve'){
      transActivityType = activityObj.RESERVE_AUTH;

      return await newRentalSession(userNum, unitNum);
    }else{
      transActivityType = null;
    }
  }

  let newRentalSession = async (userNum, unitNum, hasReservation = false) => {
    return await getRentalData(userNum, unitNum, hasReservation)
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
      })
      .catch(err => Promise.reject(err));
  }

  await transAuth(userNum, unitNum)
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
        auth_activity_id: unitAcitivityId
      });

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
          case 1:
            body.constructError(4, `User or Unit is not authorized for this service.`);
            break;
          case 2:
            body.constructError(4, `Rental info for either User and Unit or Unit does not exists.`);
            break;
          case 3:
            body.constructError(4, `Cannot perform overdue service, session is ongoing.`);
            break;
          case 4:
            body.constructError(4, `Cannot perform extend service, session has expired.`);
            break;
          case 5:
            body.constructError(4, `Session not found.`);
            break;
          case 6:
            body.constructError(4, `Invalid Session.`);
            break;
          case 7:
            body.constructError(4, `Cannot perform rent service, user already has this current rental unit.`);
            break;
          case 8:
            body.constructError(4, `Cannot perform rent service, reservation process is not yet complete. Please ask the developer for assistance.`);
            break;
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })
});

router.post('/transaction/invoice', async (req, res) => {
  const invoiceLogs = await loadCollections('Invoice');

  const currTime = Math.floor((new Date).getTime()/1000);

  const activityId = req.body.auth_activity_id || req.query.auth_activity_id || null;
  const hours = req.body.hours || req.query.hours || null;

  let body = {};
  let invoiceHours;
  let invoiceAmount;

  !activityId ? body.constructError(1, `Authentication Activity ID parameter is required.`) : null;

  await isActivityAuth(activityId, false, true)
    .then(async result => {
      let activityData = result;
      let activityType = activityData.type;
      let totalAmount = calculateFee(hours);

      if(activityType == activityObj.RESERVE_AUTH){
        invoiceHours = .75; // TODO: Set global variable (45min reservation window time)
        invoiceAmount = 0;
      }else{
        !hours ? body.constructError(1, `Hours parameter is required.`) : null;

        if(!hours){
          return Promise.reject(-1);
        }

        invoiceHours = hours;
        invoiceAmount = totalAmount
      }

      if(!activityId){
        return Promise.reject(-1);
      }

      return await invoiceLogs
        .findOne({
          'activity_log_id': activityId
        })
        .then(async result => {
          if(!!result){
            return Promise.reject(3);
          }else{
            return Promise.resolve();
          }
        })
        .then(async result => {
          return await invoiceLogs 
            .insertOne({
              'activity_log_id': activityId,
              'hours': invoiceHours,
              'amount': invoiceAmount,
              'date': currTime
            })
            .catch(err => {console.error(err); return Promise.reject(4)})
            .then(result => {
              let invoiceId = result.insertedId.toString();
    
              return Promise.resolve({
                invoice_id: invoiceId,
                fee: invoiceAmount
              });
            })
        })
        .catch(err => Promise.reject(err));
    })
    .then(invoiceObj => {
      body.constructBody(invoiceObj)

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
            break;
          case 1:
            body.constructError(4, `Activity Log is not authorized for this service.`);
            break;
          case 2:
            body.constructError(4, `Unit Activity Log does not exists with the given activity ID.`);
            break;
          case 3:
            body.constructError(4, `Invoice already exists for the given activity ID.`);
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
  const userAccounts = await loadCollections('RFID_Card');

  let amount = parseInt(req.query.amount || req.body.amount) || null;
  const userNum = req.decoded.id_num || null;

  let body = {};

  !amount ? body.constructError(1, `Amount parameter is required.`) : null;

  await userAccounts
    .findOne({
      'id_num': userNum
    })
    .then(result => {
      if(!amount){
        return Promise.reject(-1);
      }

      if(!!result){
        let userCreditBalance = result.credit;

        if(amount >= 0){
          let userUpdatedCreditBalance = userCreditBalance + amount;

          return Promise.resolve(userUpdatedCreditBalance);
        }else{
          return Promise.reject(2);
        }

      }else{
        return Promise.reject(1);
      }
    })
    .then(async userBalance => {
      return await userAccounts
        .updateOne({
          'id_num': userNum
        }, {
          $set: {
            'credit': userBalance
          }
        })
        .then(result => {
          return Promise.resolve(userBalance);
        })
    })
    .then(userBalance => {
      body.constructBody({
        updated_balance: userBalance
      });

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
            break;
          case 1:
            body.constructError(2, `User account not found.`);
            break;
          case 2:
            body.constructError(2, `Amount must be of a positive integer.`);
            break;
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })
});

router.post('/transaction/authenticate', async (req, res) => {
  const currTime = Math.floor((new Date).getTime()/1000);
  const activityLogs = await loadCollections('Unit_Activity_Logs');
  const transactionLogs = await loadCollections('Transaction_Log');
  const userAccounts = await loadCollections('RFID_Card');
  const invoiceLogs = await loadCollections('Invoice');

  const invoiceId = req.query.invoice_id || req.body.invoice_id || null;
  const amount = parseInt(req.query.transaction_amount || req.body.transaction_amount);

  const userNum = req.decoded.id_num || null;

  let body = {};
  isNaN(amount) ? body.constructError(1, `Amount parameter is required.`) : null;
  !userNum ? body.constructError(1, `User Id parameter is required.`) : null;
  !invoiceId ? body.constructError(1, `Invoice ID parameter is required.`) : null;

  await verifyObjectId(invoiceId)
    .catch(err => { console.error(err); return Promise.reject(0) })
    .then(async id => {
      // Get invoice data
      if(isNaN(amount) || !invoiceId){
        return Promise.reject(-1);
      }

      return await invoiceLogs
        .findOne({
          '_id': id
        })
        .then(result => {
          if(!!result){
            return Promise.resolve(result);
          }else{
            return Promise.reject(1);
          }
        })
    })
    .then(async invoiceData => {
      return Promise.all([
          verifyInvoiceBalance(invoiceData.activity_log_id), 
          verifyUserBalance(userNum), 
          verifyInvoiceSessionTime(invoiceData),
        ])  
        .then(async verifyResolves => {
          let userCreditBalance = verifyResolves[1];
          let invoiceAmount = invoiceData.amount;
          let updatedBal = userCreditBalance - amount;
          return await Promise.all([
              updateUserBal(updatedBal),
              addTransactionLog(amount, currTime, invoiceId),
              getInvoiceTransactionPayments(invoiceId)
            ])
            .then(async resolves => {
              let totalPayments = resolves[2];
              let invoiceBal = invoiceAmount - totalPayments;

              if(totalPayments >= invoiceAmount){
                await verifyObjectId(invoiceData.activity_log_id)
                  .catch(err => {console.error(err); return Promise.reject(0)})
                  .then(async id => {
                    return await activityLogs
                      .updateOne({
                        '_id': id
                      }, {
                        $set: {
                          'authenticated': true
                        }
                      })
                      .then(result => Promise.resolve())
                      .catch(err => { console.error(err); return Promise.reject(0)} )
                  })
                  .catch(err => { console.error(err); return Promise.reject(0)} )
              }
              return Promise.resolve([invoiceBal, updatedBal])
            })
            .catch(err => Promise.reject(err));
        })
        .catch(err => Promise.reject(err));
    })
    .then(results => {
      let invoiceBal = results[0];
      let userBal = results[1];

      body.constructBody({
        invoice_balance: invoiceBal,
        user_balance: userBal,
      });

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode == 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
            break;
          case 1:
            body.constructError(4, `Invoice not found.`);
            break;
          case 2:
            body.constructError(4, `Session for the payment on invoice has already expired.`);
            break;
          case 3:
            body.constructError(4, `User account not found.`);
            break;
          case 4:
            body.constructError(4, `Credit balance of the user is not sufficient enough.`);
            break;
          case 5:
            body.constructError(4, `Activity ID for this invoice is not found.`);
            break;
          case 6:
            body.constructError(4, `Invoice has already been paid.`);
            break;
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })
  
  // updates user balance deducted with the amount
  async function updateUserBal(updatedBal){
    return await userAccounts
      .updateOne({
        'id_num': userNum
      }, {
        $set: {
          'credit': updatedBal
        }
      })
      .then(result => Promise.resolve())
      .catch(err => Promise.reject(err))
  }

  // adds a transaction log for the current payment
  async function addTransactionLog(amount, time, id){
    return await transactionLogs
      .insertOne({
        amount: amount,
        date: time,
        invoice_id: id
      })
      .then(result => Promise.resolve())
      .catch(err => Promise.reject(err));
  }
  
  // Sum up all total transaction payments for an invoice
  async function getInvoiceTransactionPayments(invoiceId){
    return await transactionLogs
      .find({
        'invoice_id': invoiceId
      })    
      .toArray()
      .then(async transactions => {
        let totalPayments = 0;

        transactions.forEach(transaction => {
          totalPayments += transaction.amount;
        })

        return Promise.resolve(totalPayments);
      })
      .catch(err => Promise.reject(err));
  }

  // Verify if invoice balance is unpaid or not.
  // Will reject w/ error code 6 if already paid.
  async function verifyInvoiceBalance(activityId){
    return await verifyObjectId(activityId)
      .catch(err => { console.error(err); return Promise.reject(0) })
      .then(async id => {
        return await activityLogs
          .findOne({
            '_id': id
          })
          .then(result => {
            if(!!result){
              return Promise.resolve(result);
            }else{
              return Promise.reject(5);
            }
          })
          .then(activity => {
            if(activity.authenticated){
              return Promise.reject(6)
            }else{
              return Promise.resolve(true);
            }
          })
          .catch(err => Promise.reject(err));
      })
  }
  
  // Verify if user has sufficient credit for the amount to deduct
  async function verifyUserBalance(userNum){
    //TODO: Make this asynchronous with isTimeAuth 
    return await userAccounts 
      .findOne({
        'id_num': userNum
      })
      .then(result => {
        // get the credit balance
        // Checks if user has enough credit for the amount
        if(!!result){
          let creditBalance = result.credit;
          if(creditBalance >= amount){
            return Promise.resolve(creditBalance);
          }else{
            return Promise.reject(4);
          }
        }else{
          return Promise.reject(3)
        }
      })
      .catch(err => Promise.reject(err));
  }

  // Verify if invoice session time is within window time of 30 mins
  async function verifyInvoiceSessionTime(invoice){
    let endTime = invoice.date + (60*invoiceWindowTime); 
    // invoice time + 30 mins

    return await isTimeAuth(currTime, endTime, true)
      .then(isAuth => {
        if(isAuth){
          return Promise.resolve(true);
        }else{
          return Promise.reject(2);
        }
      })
      .catch(err => Promise.reject(err));
  }
}); 

router.post('/transaction/session', async (req, res) => {
  const unitActivities = await loadCollections('Unit_Activity_Logs');
  const sessionLogs = await loadCollections('Session_Log');
  const rentalInfos = await loadCollections('Rental_Unit_Info');

  const activityId = req.body.auth_activity_log_id || req.query.auth_activity_log_id || null;
  const userNum = req.decoded.id_num || null;

  const currTime = Math.floor((new Date).getTime()/1000);
  let body = {};
  let newType;

  !userNum ? body.constructError(1, `User ID parameter is required.`) : null;
  !activityId ? body.constructError(1, `Authorization Log ID parameter is required.`) : null;

  await isActivityAuth(activityId, true, true)
    .then(async activity => {
      let sessionId    = activity.session_id;
      let activityType = activity.type;
      let invoiceTime  = await getInvoiceTime(activityId);

      if(!activityAuth.includes(activityType)){
        return Promise.reject(3);
      }else{
        newType = activitySession[activityAuth.indexOf(activityType)];
      }
      // TODO Make sure no duplication of the same activity type
      if((activityType === activityObj.RENT_AUTH) || (activityType === activityObj.RESERVE_AUTH)){
        return await verifyObjectId(sessionId)
          .catch(err => {console.error(err); return Promise.reject(0)})
          .then(async id => {
            return await sessionLogs
              .findOne({
                '_id': id
              })
              .then(async session => {
                if(!!session){
                  return Promise.resolve(session);
                }else{
                  return Promise.reject(4);
                }
              })
              .catch(err => Promise.reject(err));
          })
          .then(async session => {
            return await rentalInfos
              .updateOne({
                'unit_num': session.unit_num
              }, {
                $set: {
                  user_num  : userNum,
                  mode      : 'occupied',
                  session_id: sessionId
                }
              })
              .then(result => {
                return Promise.resolve([sessionId, currTime, currTime, invoiceTime]);
              })
          })
          .catch(err => Promise.reject(err));
       
      }else if(activityType === activityObj.EXTEND_AUTH){
        return await verifyObjectId(sessionId)
          .then(async id => {
            return await sessionLogs
              .findOne({
                '_id': id
              })
              .then(session => {
                let endTime = session.end_date;
                let startTime = session.start_date;

                return Promise.resolve([sessionId, startTime, endTime, invoiceTime]);
              })
          }) 
      }else if(activityType === activityObj.OVERDUE_AUTH){

      }
    })
    .then(async results => {
      let sessionId = results[0];
      let startTime = results[1];
      let time      = results[2];
      let hours     = parseFloat(results[3]);

      return await updateSessionEndTime(sessionId, startTime, time, hours);
    })
    .then(async sessionId => {
      return await unitActivities
        .insertOne({
          type: newType,
          date: currTime,
          authenticated: true,
          session_id: sessionId
        })
        .then(result => {
          return Promise.resolve(sessionId);
        })
    })
    .then(sessionId => {
      body.constructBody({
        session_id: sessionId
      });

      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
            break;
          case 1:
            body.constructError(4, `Activity Log is not authorized for this service.`);
            break;
          case 2:
            body.constructError(4, `Unit Activity Log does not exists with the given activity ID.`);
            break;
          case 3:
            body.constructError(4, `Activity is not a valid activity type.`);
            break;
          case 4:
            body.constructError(4, `Session not found for the given Activity ID.`);
            break;
          case 5:
            body.constructError(4, `This activity has already been performed.`);
            break;
          case 6:
            body.constructError(4, `Invoice not found.`);
            break;
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })
});

router.post('/transaction/end', async (req, res) => {
  const rentalInfos = await loadCollections('Rental_Unit_Info');
  const sessionLogs = await loadCollections('Session_Log');
  const unitActivityLogs = await loadCollections('Unit_Activity_Logs');

  const currTime = Math.floor((new Date).getTime()/1000);

  const sessionId = req.body.session_id || null;
  const userNum = req.decoded.id_num || null;

  let body = {};

  !sessionId ? body.constructError(1, `Session ID parameter is required.`) : null;

  await verifyObjectId(sessionId)
    .catch(err => {console.error(err); return Promise.reject(0)})
    .then(async id => {
      return await sessionLogs
        .findOne({
          '_id': id
        })
        .then(async session => {
          if(!!session){
            let endTime = session.end_date;

            if(session.user_num == userNum){
              return await isTimeAuth(currTime, endTime, true)
                .then(isAuth => {
                  if(isAuth){
                    return Promise.resolve(sessionId);
                  }else{
                    return Promise.reject(2);
                  }
                })
            }else{
              return Promise.reject(4);
            }
          }else{
            return Promise.reject(1);
          }
        })
    })
    .then(async sessionId => {
      return await rentalInfos
        .updateOne({
          'session_id': sessionId
        }, {
          $set: {
            'user_num': null,
            'mode': 'available',
            'session_id': null
          }
        })
        .then(result => {
          if(!!result){
            return Promise.resolve();
          }else{
            return Promise.reject(3);
          }
        })
    })
    .then(async result => {
      await unitActivityLogs
        .insertOne({
          type: 'end_session',
          date: currTime,
          authenticated: true,
          session_id: sessionId
        })
        .then(result => Promise.resolve());
    })
    .then(result => {
      body.constructBody({
        session_id: sessionId
      });
      res.send(body);
    })
    .catch(errorCode => {
      if(typeof errorCode === 'number'){
        switch(errorCode){
          case 0:
            body.constructError(2, `Please ask the developer for assistance.`);
            break;
          case 1:
            body.constructError(4, `Session log not found.`);
            break;
          case 2:
            body.constructError(4, `Session is overdue. Please settle overdue first.`);
            break;
          case 3:
            body.constructError(4, `Invalid session. No rental information found.`);
            break;
          case 4:
            body.constructError(5, `User is not authorized to end this specific session.`);
            break;
        }
      }else{
        console.error(errorCode);
        body.constructError(2, `Please ask the developer for assistance.`);
      }
      
      res.send(body);
    })
});

async function updateSessionEndTime(sessionId, startTime, endTime, hours){
  const sessionLogs = await loadCollections('Session_Log');

  return await verifyObjectId(sessionId)
    .then(async id => {
      let newEndTime = endTime + (60*60*hours);

      return await sessionLogs
        .updateOne({
          '_id': id
        }, {
          $set: {
            start_date: startTime,
            end_date: newEndTime
          }
        })
        .then(result => {
          return Promise.resolve(sessionId);
        })
    })
    .catch(err => Promise.reject(err));
}

async function getInvoiceTime(activityId){
  const invoiceLogs = await loadCollections('Invoice');

  return await invoiceLogs
    .findOne({
      'activity_log_id': activityId
    })
    .then(invoice => {
      if(!!invoice){
        let hours = invoice.hours;

        return Promise.resolve(hours);
      }else{
        return Promise.reject(6);
      }
    })
}

async function isActivityAuth(activityId, isAuthenticated, returnActivity = false){
  const unitActivities = await loadCollections('Unit_Activity_Logs');

  return await verifyObjectId(activityId)
    .catch(err => {console.error(err); return Promise.reject(0)})
    .then(async id => {
      return await unitActivities
        .findOne({
          '_id': id
        })
        .catch(err => {console.error(err); return Promise.reject(2)})
        .then(result => {
          if(!!result){
            if((result.authenticated && isAuthenticated) || (!result.authenticated && !isAuthenticated)){
              if(returnActivity){
                return Promise.resolve(result);
              }else{
                return Promise.resolve(true);
              }
            }else{
              return Promise.reject(1);
            }
          }else{
            return Promise.reject(2);
          }
        })
        .catch(err => Promise.reject(err));
    })
    .catch(err => Promise.reject(err));
}

module.exports = router;