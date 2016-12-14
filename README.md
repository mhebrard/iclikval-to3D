# iclikval-to3D

iclikval-to3D is a micro-service design to works with [iCLiKVAL](http://iclikval.riken.jp/). It request the annotations and media from the database, compute a correlation network and position the nodes of the network in a 3D space. Linked with unity3D application, it allows to design a immersive representation of the iCLiKVAL content.

The service run on **node** server (https://nodejs.org/en/).

# Configuration

For security reason, an app token is needed to request iCLiKVAL API.
For same purpose, an app key is needed to request iclikval-to3D.
Before running the application on your server you need to add these token and key in a file

In root folder, create "config.json" file.

~~~
{
	"port":[....],
	"token":"[iCLiKVAL-Access-Token]",
	"keys": {
		"[client1-IP]":"[client1-application-key]",
		"[client2-IP]":"[client2-application-key]"
		}
}
~~~

Modify the [...] elements according to your configuration

We suggest the use of **uuid** (https://github.com/broofa/node-uuid) to generate application-key

# Server installation

~~~
npm install
~~~

# Run application

~~~
node ./app.js
~~~
