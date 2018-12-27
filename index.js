const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(bodyParser.json());
app.use(cors());

const user = require('./routes/user');
const locker = require('./routes/locker');

app.use('/user', user);
app.use('/locker', locker);

const port = process.env.PORT || 5000;

app.listen(port, function() {
  console.log(`Server has started on port ${port} `);
})