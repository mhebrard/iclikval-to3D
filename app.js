//require
var express = require('express');
var fs = require('fs')
var path = require('path');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var model = require('./model/model.js');
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

//define routes

//Open access routes
app.get('/',function(req,res) {
	console.log('HOME');
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.end('Node server Hello World\n');
});


app.use('/universe', require('./routes/universe.js'));
app.use('/galaxy', require('./routes/galaxy.js'));

//listen
app.listen(port, function() {
	console.log('Server running on',port);
	var params = {filters:{'year':'2017'}};
	model.universe.request(params)
	.then(() => {
		var univ = model.universe.get()
		console.log('Universe Nodes Count', univ.nodes.length)
		console.log('Universe Node[0]', univ.nodes[0]);
		console.log('Universe Edges Count', univ.edges.length)
		console.log('Universe Node[0]', univ.edges[0]);
		console.log('ready');
	});
	/**/
	/* params.filters['media_type'] = 'journal_article';
	model.galaxy.request(params).then(() => {
		//console.log('Galaxy', model.galaxy.get())
		return Promise.resolve();
	}); */
})
