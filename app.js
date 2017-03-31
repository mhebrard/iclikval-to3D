// require
var fs = require('fs');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var model = require('./model/model.js');
var config = require('./config.json');

// init app
var app = express();
var port = process.env.PORT || config.port;
// create a write stream for log
var accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), {flags: 'a'});

// config app
// app.set('view engine', 'pug');
// app.set('views', path.join(__dirname, 'views'));

// use middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended: true})); // form parser
// app.use(bodyParser.json())
app.use(morgan('combined', {stream: accessLogStream})); // setup the logger

// define routes

// Open access routes
app.get('/', function(req, res) {
  console.log('HOME');
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Node server Hello World\n');
});

app.use('/all', require('./routes/all.js'));
app.use('/catalogue', require('./routes/catalogue.js'));

// listen
app.listen(port, function() {
  console.log(`Server running on ${port}`);
  var param = {filters: {reviewer: 'tdtaylor'}};
  // var param = {filters: {reviewer: 'r1nter4569'}, radius: 6};
  model.count.request(param).then(c => {
    // console.log('Nodes Count', c.nodes.length);
    console.log('Count', c);
    // console.log('Node[0]', c.nodes[0]);
    // console.log('updated', c.updated);
    // console.log('root', c.root);
    return Promise.resolve();
  }).then(() => {
    console.log('ready');
  }).catch(err => {
    return Error(`server start: ${err}`);
  });
});
