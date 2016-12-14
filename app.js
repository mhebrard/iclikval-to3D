//require
var express = require('express');
var fs = require('fs')
var path = require('path');
var bodyParser = require('body-parser');
var morgan = require('morgan');
// var model = require('./model/model.js');
var config = require('./config.json');

//init app
var app = express();
var port = process.env.PORT ||  config.port;
// create a write stream for log
var accessLogStream = fs.createWriteStream(path.join(__dirname,'access.log'), {flags: 'a'});

//config app
//app.set('view engine', 'pug');
//app.set('views', path.join(__dirname, 'views'));

//use middleware
app.use(express.static( path.join(__dirname,'public') ));
app.use(bodyParser.urlencoded({ extended: true })); //form parser
//app.use(bodyParser.json())
app.use(morgan('combined', {stream: accessLogStream})) //setup the logger

// app.use('/universe', require('./routes/universe.js'));

//define routes

//Open access routes
app.get('/',function(req,res) {
	console.log('HOME');
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end('Node server Hello World\n');
});


app.use('/universe', require('./routes/universe.js'));
// app.use('/info', require('./routes/info.js'));

/*
app.get('/rewards',function(req,res) {
	console.log('REWARDS')
	res.render('rewards',{title:"Rewards list",data:model.badges})
})
*/

//listen
app.listen(port, function() {
	console.log('Server running on',port);
})
