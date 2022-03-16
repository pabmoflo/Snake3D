/*
** @author: rvivo@upv.es, pabmoflo
** @date: 3-03-2021
** @dependencies: OrbitControls.js, Tween.js, dat.gui.min.js
*/

"use strict";

// Variables globales estandar
var renderer, scene, camera, uiScene, uiCamera;

// Control
var cameraControls;

// Minicamara
var minicam;

var spaceText, controlInfo, ptsText, numberText, numberFont = null, textMat;

var snake;

const playFieldSize = 9;

function isPosInList(posList, pos) {
	var found = false;
	posList.every(element => {
		if (pos[0] == element[0] && pos[1] == element[1])
		{
			found = true;
			return false;
		}
		return true;
	});
	return found;
}

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

Number.prototype.pad = function(size) {
    var s = String(this);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
}

class Queue {
	constructor() {
	  this.el = {};
	  this.head = 0;
	  this.tail = 0;
	}
	enqueue(el) {
	  this.el[this.tail] = el;
	  this.tail++;
	}
	dequeue() {
	  const ret = this.el[this.head];
	  delete this.el[this.head];
	  this.head++;
	  return ret;
	}
	length() {
	  return this.tail - this.head;
	}
  }

class SnakePart {
	constructor() {
		this.resources = {};
		this.posX = 0;
		this.posZ = 0;
		this.rotation = 0;
		this.next = null;
		this.isHead = true;
		this.needsGrow = false;
		this.stopUpdating = false;
		this.isCurve = false;
		this.grp = new THREE.Group();
		scene.add(this.grp);
		this.direcion = [0, -1];
		this.nextDirection = [0, -1];
		this.requestDirChange = 0; // 0 -> none, 1 -> left, 2 -> right
		this.prevPart = null;
		this.notifyReady = true;
		this.nearFruit = false;
		this.hasTongue = false;
		this.showTongue = false;
		this.tongueAnim = [null, null];
	}

	addResource(name, res, recursive, clone) {
		if (!(name in this.resources))
			this.resources[name] = clone ? res.clone() : res;
		if (this.next && recursive)
			this.next.addResource(name, res, true, clone);
		if (this.notifyReady && Object.keys(this.resources).length >= 5) {
			this.updateModelPart();
			this.notifyReady = false;
		}
	}

	destroy() {
		scene.remove(this.grp);
	}

	changeModelPart(newPart) {
		if (this.prevPart != newPart) {
			if (this.prevPart) {
				this.grp.remove(this.prevPart);
			}
			this.grp.add(newPart);
			this.prevPart = newPart;
		}
	}

	tongueReady() {
		if (!this.isHead)
			return;
		if (!this.hasTongue) {
			this.grp.add(this.resources["tongue"]);
			this.hasTongue = true;
		}
	}

	updateModelPart() {
		if (this.isHead) {
			if (this.nearFruit)
			this.changeModelPart(this.resources["headO"]);
			else
				this.changeModelPart(this.resources["headC"]);
		} else if (!this.next) {
			this.changeModelPart(this.resources["tail"]);
		} else if (this.isCurve) {
			this.changeModelPart(this.resources["curve"]);
		} else {
			this.changeModelPart(this.resources["body"])
		}
	}

	dirEqu(left, right) {
		return left[0] == right[0] && left[1] == right[1];
	}

	hasDir(dir) {
		return this.dirEqu(this.direcion, dir);
	}

	getRotateAngle(direction) {
		if (this.dirEqu(direction, [0, -1]))
			return 0;
		else if (this.dirEqu(direction, [1, 0]))
			return (Math.PI * 3 / 2);
		else if (this.dirEqu(direction, [0, 1]))
			return (Math.PI);
		else
			return (Math.PI / 2);
	}

	update() {
		if (this.isHead && this.requestDirChange) {
			if (this.requestDirChange == 1) {
				if (this.dirEqu(this.direcion, [0, -1]))
					this.direcion = [-1, 0];
				else if (this.dirEqu(this.direcion, [-1, 0]))
					this.direcion = [0, 1];
				else if (this.dirEqu(this.direcion, [0, 1]))
					this.direcion = [1, 0];
				else
					this.direcion = [0, -1];
			} else if (this.requestDirChange == 2) {
				if (this.dirEqu(this.direcion, [0, -1]))
					this.direcion = [1, 0];
				else if (this.dirEqu(this.direcion, [1, 0]))
					this.direcion = [0, 1];
				else if (this.dirEqu(this.direcion, [0, 1]))
					this.direcion = [-1, 0];
				else
					this.direcion = [0, -1];
			}
			this.requestDirChange = 0;
		}

		this.setRotationImpl(this.getRotateAngle(this.direcion));

		if (!this.isHead) this.updateModelPart();

		if (!this.stopUpdating) {
			this.setPosX(this.posX + this.direcion[0]);
			this.setPosZ(this.posZ + this.direcion[1]);
		}

		if (this.needsGrow && this.isHead) {
			var prevNext = this.next;
			this.setNext(new SnakePart());
			this.next.setNext(prevNext);
			this.next.setPosX(this.posX - this.direcion[0]);
			this.next.setPosZ(this.posZ - this.direcion[1]);
			this.next.stopUpdating = true;
			this.next.direcion[0] = this.next.next.direcion[0];
			this.next.direcion[1] = this.next.next.direcion[1];
			Object.keys(this.resources).forEach(element => {
				this.next.addResource(element, this.resources[element], false, true);
			});
			this.needsGrow = false;
		}

		if (this.next) {
			this.next.isCurve = this.next.next && !this.dirEqu(this.direcion, this.next.direcion);
			this.next.nextDirection[0] = this.direcion[0];
			this.next.nextDirection[1] = this.direcion[1];
			if (!this.stopUpdating) {
				this.next.update();
				if (this.next.isCurve) {
					if ((this.rotation < this.next.rotation || (this.next.rotation == 0 && this.rotation ==  (Math.PI * 3 / 2))) && !((this.rotation == 0 && this.next.rotation ==  (Math.PI * 3 / 2))))
						this.next.setMirror(false);
					else
						this.next.setMirror(true);
				} else this.next.setMirror(false);
				if (!this.next.next) {
					this.next.setRotationImpl(this.getRotateAngle(this.direcion))
				}
			}
			this.stopUpdating = false;
		}
		if (!this.isHead) {
			this.direcion[0] = this.nextDirection[0]
			this.direcion[1] = this.nextDirection[1]
		}
	}

	getPos() {
		return [this.posX, this.posZ];
	}

	setPosX(x) {
		this.posX = x;
		this.grp.position.x = this.posX * 2;
	}

	setPosZ(z) {
		this.posZ = z;
		this.grp.position.z = this.posZ * 2;
	}

	setRotationImpl(r) {
		this.rotation = r;
		this.grp.rotation.y = this.rotation;
	}

	setMirror(mirror) {
		this.grp.scale.x = mirror ? -1 : 1;
	}

	setNext(next) {
		this.next = next;
		if (next)
			next.isHead = false;
	}

	getNext() {
		return this.next;
	}
}

class Fruit {
	constructor() {
		this.grp = new THREE.Object3D();
		scene.add(this.grp);
		this.resLoaded = false;
		this.posX = 0;
		this.posZ = 0;
	}
	setResource(res) {
		if (!this.resLoaded)
			this.grp.add(res);
	}

	newRandomPos(snakePos) {
		var newPos = [getRandomInt(-playFieldSize + 1, playFieldSize), getRandomInt(-playFieldSize + 1, playFieldSize)];
		var tries = 0;
		for (tries = 0; tries < 50; tries++) {
			if (isPosInList(snakePos, newPos))
				newPos = [getRandomInt(-playFieldSize + 1, playFieldSize), getRandomInt(-playFieldSize + 1, playFieldSize)];
			else
				break;
		}
		if (tries >= 50) { // Too many tries, find an empty spot manually
			var restart = 0;
			var found = false;
			while (restart < 2) {
				var i;
				var j;
				if (restart == 0) {
					i = newPos[0];
					j = newPos[1];
				} else {
					i = -playFieldSize + 1;
					j = -playFieldSize + 1;
				}
				for (;i < playFieldSize; i++) {
					for (; j < playFieldSize; j++) {
						newPos = [i, j];
						if (!isPosInList(snakePos, newPos))
						{
							found = true;
							break;
						}
					}
					if (found) break;
				}
				if (found) break;
				restart++;
			}
			if (!found) {
				this.setPosX(100000);
				this.setPosZ(100000);
				return;
			}
		}
		this.setPosX(newPos[0]);
		this.setPosZ(newPos[1]);
	}

	setPosX(x) {
		this.posX = x;
		this.grp.position.x = this.posX * 2;
	}

	setPosZ(z) {
		this.posZ = z;
		this.grp.position.z = this.posZ * 2;
	}

	getPos() {
		return [this.posX, this.posZ];
	}
}

class Snake {
	
	constructor() {
		this.minSpeed = 650;
		this.maxSpeed = 200;
		this.minSpeedPts = 0;
		this.maxSpeedPts = 20;
		this.fruit = new Fruit();
		this.queue = new Queue();
		this.setStartState()
		this.loadResources()
	}
	loadResources() {
		var own = this;
		new THREE.FBXLoader()
		.load('models/snake/bodyHead.fbx', function (object) {
			object.traverse(function (child) {
				if (child.geometry) {
				  child.castShadow = true;
				}
			});
			own.head.addResource("headC", object, true, false);
		});
		new THREE.FBXLoader()
		.load('models/snake/bodyStraight.fbx', function (object) {
			object.traverse(function (child) {
				if (child.geometry) {
				  child.castShadow = true;
				}
			});
			own.head.addResource("body", object, true, true);
		});
		new THREE.FBXLoader()
		.load('models/snake/bodyTail.fbx', function (object) {
			object.traverse(function (child) {
				if (child.geometry) {
				  child.castShadow = true;
				}
			});
			own.head.addResource("tail", object, true, false);
		});
		new THREE.FBXLoader()
		.load('models/snake/bodyCurve.fbx', function (object) {
			object.traverse(function (child) {
				if (child.geometry) {
				  child.castShadow = true;
				}
			});
			own.head.addResource("curve", object, true, true);
		});
		new THREE.FBXLoader()
		.load('models/snake/bodyHeadOpen.fbx', function (object) {
			object.traverse(function (child) {
				if (child.geometry) {
				  child.castShadow = true;
				}
			});
			own.head.addResource("headO", object, true, false);
		});
		new THREE.FBXLoader()
		.load('models/snake/headTonge.fbx', function (object) {
			object.traverse(function (child) {
				if (child.geometry) {
				  child.castShadow = true;
				}
			});
			own.head.addResource("tongue", object, true, false);
			own.head.tongueReady();
			object.position.z = 1;
			var moveAnim = new TWEEN.Tween(object.position);
			moveAnim.to({ z: [1, 1, 1, -0.25, -0.25, 1, 1, 1, -0.25, 1, 1, 1, 1, 1, 1, 1, 1]}, 6456);
			moveAnim.repeat(Infinity);
			moveAnim.start();
			var rotAnim = new TWEEN.Tween(object.rotation);
			rotAnim.to({ x: [0.035, 0, -0.035, 0]}, 75);
			rotAnim.repeat(Infinity);
			rotAnim.start();
			own.head.tongueAnim[0] = moveAnim;
			own.head.tongueAnim[1] = rotAnim;
		});
		new THREE.FBXLoader()
		.load('models/apple.fbx', function (object) {
			object.traverse(function (child) {
				if (child.geometry) {
				  child.castShadow = true;
				}
			});
			object.castShadow = true;
			own.fruit.setResource(object);
			var rotAnim = new TWEEN.Tween(object.rotation);
			rotAnim.to({ y: [Math.PI * 2]}, 3000);
			rotAnim.repeat(Infinity);
			rotAnim.start();
			object.position.y = 0.2;
			var moveAnim = new TWEEN.Tween(object.position);
			moveAnim.to({ y: [0.2 + 0.4, 0.2, 0.2 - 0.4, 0.2]}, 2000);
			moveAnim.interpolation( TWEEN.Interpolation.Bezier);
			moveAnim.repeat(Infinity);
			moveAnim.start();
		});
	}

	getOccupiedPos(includeHead) {
		var cur = this.head;
		if (!includeHead)
			cur = cur.getNext();
		var ret = [];
		while (cur) {
			ret.push(cur.getPos());
			cur = cur.getNext();
		}
		return ret;
	}

	setStartState() {
		var start = new SnakePart();
		var mid = new SnakePart();
		var tail = new SnakePart();
		
		this.head = start;

		start.setNext(mid);
		mid.setNext(tail);

		this.reset();

		this.fruit.newRandomPos(this.getOccupiedPos(true));
	}

	reset() {
		var tail = this.head.getNext().getNext();
		var start = tail.getNext();
		tail.setNext(null);
		while (start) {
			start.destroy();
			start = start.getNext();
		}

		start = this.head;
		start.showTongue = false;
		start.nearFruit = false;
		start.needsGrow = false;
		for (var i = 0; i < 3; i++) {
			start.direcion[0] = 0;
			start.direcion[1] = -1;
			start.isCurve = false;
			start.setRotationImpl(0);
			start.setPosX(0);
			start.setPosZ(i);
			start.updateModelPart()
			start = start.getNext();
		}
		this.speed = 0;
		this.points = 0;

		this.antes = Date.now();
		this.paused = true;
		this.hasJustReset = true;
		if (spaceText)
			spaceText.visible = true;
		if (controlInfo)
			controlInfo.visible = true;
	}

	advance() {
		
		this.head.update();

		if ((Math.abs(this.head.posX - this.fruit.posX) < 2 && Math.abs(this.head.posZ - this.fruit.posZ) < 2 ) && !(this.head.posX == this.fruit.posX && this.head.posZ == this.fruit.posZ))
			this.head.nearFruit = true;
		else
			this.head.nearFruit = false;
		this.head.updateModelPart();
		var snakePos = this.getOccupiedPos(false);
		var headPos = this.head.getPos();
		var fruitPos = this.fruit.getPos();
		if (isPosInList(snakePos, headPos) || headPos[0] <= -playFieldSize || headPos[0] >= playFieldSize || headPos[1] <= -playFieldSize || headPos[1] >= playFieldSize)
		{
			this.reset();
			this.fruit.newRandomPos(this.getOccupiedPos(true));
			return;
		}
		if (headPos[0] == fruitPos[0] && headPos[1] == fruitPos[1]) {
			this.fruit.newRandomPos(this.getOccupiedPos(true));
			this.grow();
			this.points += 1;
			changeNumber(this.points);
			this.speed = (this.points - this.minSpeedPts) / (this.maxSpeedPts - this.minSpeedPts);
			if (this.speed > 1) this.speed = 1;
		}
	}

	grow() {
		if (!this.head.needsGrow)
			this.head.needsGrow = true;
	}

	turn(direction) {
		this.head.requestDirChange = direction;
	}

	changeDir(newDir) {
		if (this.head.requestDirChange)
			return;
		const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
		var reqDir = directions[newDir];
		if (Math.abs(this.head.direcion[0]) == Math.abs(reqDir[0]) && Math.abs(this.head.direcion[1]) == Math.abs(reqDir[1]))
			return;
		if (newDir == 0 && this.head.hasDir(directions[1]))
			this.turn(1);
		else if (newDir == 0 && this.head.hasDir(directions[3]))
			this.turn(2);
		else if (newDir == 1 && this.head.hasDir(directions[2]))
			this.turn(1);
		else if (newDir == 1 && this.head.hasDir(directions[0]))
			this.turn(2);
		else if (newDir == 2 && this.head.hasDir(directions[3]))
			this.turn(1);
		else if (newDir == 2 && this.head.hasDir(directions[1]))
			this.turn(2);
		else if (newDir == 3 && this.head.hasDir(directions[0]))
			this.turn(1);
		else if (newDir == 3 && this.head.hasDir(directions[2]))
			this.turn(2);
	}

	addEvent(ev) {
		if (this.queue.length() < 2) {
			this.queue.enqueue(ev);
		}
	}

	changePauseState() {
		this.paused = !this.paused;
		if (this.hasJustReset) {
			changeNumber(this.points);
			this.queue = new Queue();
			controlInfo.visible = false;
			this.hasJustReset = false;
		}
	}

	update() {
		var ahora = Date.now();
		var waitTime = ((1 - this.speed) * (this.minSpeed - this.maxSpeed) + this.maxSpeed);
		if ((ahora - this.antes) > waitTime && !this.paused) {
			if (this.queue.length()) {
				snake.changeDir(this.queue.dequeue() - 1);
			}
			snake.advance();
			this.antes = ahora;
		}
		if (this.head.nearFruit && this.head.tongueAnim[0] && !this.head.tongueAnim[0].isPaused()) {
			this.head.tongueAnim[0].pause();
			this.head.tongueAnim[1].pause();
			this.head.resources["tongue"].position.z = 1;
		} else if (!this.head.nearFruit && this.head.tongueAnim[0] && this.head.tongueAnim[0].isPaused()) {
			this.head.tongueAnim[0].resume();
			this.head.tongueAnim[1].resume();
		}
	}
}

function loadDecoration() {
	function setupDecorRes(res) {
		var clones = getRandomInt(10, 25);
		var range = playFieldSize - 1;
		for (var i = 0; i < clones; i++) {
			var posX = Math.random() * ((range * 2) - (-range * 2)) + (-range * 2);
			var posZ = Math.random() * ((range * 2) - (-range * 2)) + (-range * 2);
			var angle = Math.random() * Math.PI * 2;
			var newRes = res.clone();
			newRes.position.x = posX;
			newRes.position.z = posZ;
			newRes.rotation.y = angle;
			newRes.scale.x *= 1.75;
			newRes.scale.y *= 1.75;
			newRes.scale.z *= 1.75;
			scene.add(newRes);
		}
	}

	new THREE.FBXLoader()
	.load('models/decor/grass.fbx', function (object) {
		object.traverse(function (child) {
			if (child.geometry) {
				child.castShadow = true;
			}
		});
		setupDecorRes(object);
	});
	new THREE.FBXLoader()
	.load('models/decor/flower01.fbx', function (object) {
		object.traverse(function (child) {
			if (child.geometry) {
				child.castShadow = true;
			}
		});
		setupDecorRes(object);
	});
	new THREE.FBXLoader()
	.load('models/decor/flower02.fbx', function (object) {
		object.traverse(function (child) {
			if (child.geometry) {
				child.castShadow = true;
			}
		});
		setupDecorRes(object);
	});
	new THREE.FBXLoader()
	.load('models/decor/flower03.fbx', function (object) {
		object.traverse(function (child) {
			if (child.geometry) {
				child.castShadow = true;
			}
		});
		setupDecorRes(object);
	});
}

var pendingChange = null;
function changeNumber(val) {
	if (!numberFont) {
		pendingChange = val;
		return;
	} else if (pendingChange !== null) {
		val = pendingChange;
		pendingChange = null; 
	}
	if (numberText)
	{
		uiScene.remove(numberText);
		numberText = null;
	}
	var numberTextGeo = new THREE.TextGeometry( 
		val.pad(2),
		{
			size: 0.1,
			height: 0.05,
			curveSegments: 3,
			style: "normal",
			font: numberFont,
			bevelThickness: 0.002,
			bevelSize: 0.002,
			bevelEnabled: true
		});
	numberText = new THREE.Mesh( numberTextGeo, textMat );
	uiScene.add( numberText );
	numberText.position.x = 0.95;
	numberText.position.y = 0.85;
}

function setupText(font) {
	numberFont = font;
	textMat = new THREE.MeshPhongMaterial({color:'yellow',
                                                   specular: 'yellow',
                                                   shininess: 50 });
	var spaceTexGeo = new THREE.TextGeometry( 
		'Press \"Space\" to continue!',
		{
			size: 0.1,
			height: 0.05,
			curveSegments: 3,
			style: "normal",
			font: font,
			bevelThickness: 0.002,
			bevelSize: 0.002,
			bevelEnabled: true
		});
	spaceText = new THREE.Mesh( spaceTexGeo, textMat );
	uiScene.add( spaceText );
	spaceText.position.x = -0.8;
	spaceText.position.y = -0.9;

	var controlInfoGeo = new THREE.TextGeometry( 
		'       WASD :  Move\n    C :  Reset Camera\nMouse :  Move Camera',
		{
			size: 0.05,
			height: 0.05,
			curveSegments: 3,
			style: "normal",
			font: font,
			bevelThickness: 0.002,
			bevelSize: 0.002,
			bevelEnabled: true
		});
	controlInfo = new THREE.Mesh( controlInfoGeo, textMat );
	uiScene.add( controlInfo );
	controlInfo.position.x = -0.35;
	controlInfo.position.y = -0.6;

	var ptsTextGeo = new THREE.TextGeometry( 
		'Pts:',
		{
			size: 0.1,
			height: 0.05,
			curveSegments: 3,
			style: "normal",
			font: font,
			bevelThickness: 0.002,
			bevelSize: 0.002,
			bevelEnabled: true
		});
	ptsText = new THREE.Mesh( ptsTextGeo, textMat );
	uiScene.add( ptsText );
	ptsText.position.x = 0.7;
	ptsText.position.y = 0.85;

	changeNumber(0)
}

function init() {
	// Funcion de inicializacion de motor, escena y camara

	// Motor de render
	renderer = new THREE.WebGLRenderer();
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setClearColor( new THREE.Color(0x87ceeb) );
	renderer.shadowMap.enabled = true;
    renderer.autoClear = false; // <.......................
	document.getElementById('container').appendChild(renderer.domElement);

	// Escena
	scene = new THREE.Scene();
	uiScene = new THREE.Scene();

	// Camara
	var aspectRatio = window.innerWidth/window.innerHeight;
	camera = new THREE.PerspectiveCamera( 75, aspectRatio, 0.1, 600 );
	camera.position.set( 0, 18, 15 );
    scene.add(camera);

	// Control de camara
	cameraControls = new THREE.OrbitControls( camera, renderer.domElement );
	cameraControls.enableKeys = false;
	cameraControls.maxPolarAngle = Math.PI / 2.5;
	cameraControls.target.set( 0, 0, 5.5 );
	camera.lookAt( new THREE.Vector3( 0,0,5.5 ) );
	cameraControls.noZoom = false;

    // Minicam
    minicam = new THREE.OrthographicCamera(-playFieldSize * 2,playFieldSize * 2, playFieldSize * 2,-playFieldSize * 2, -10,100);
    minicam.position.set(0,1,0);
    minicam.up.set(0,0,-1);
    minicam.lookAt(0,-1,0);
    scene.add(minicam);

	// UI
	uiCamera = new THREE.OrthographicCamera(-aspectRatio,aspectRatio,1,-1, -10,10);
    uiCamera.position.set(0,0,1);
    uiCamera.up.set(0,1,0);
    uiCamera.lookAt(0,0,0);
    uiScene.add(minicam);

	// Luces
	var ambiental = new THREE.AmbientLight(0x808080);
	scene.add(ambiental);

	var direccional = new THREE.DirectionalLight( 0xFFFFFF, 0.5 );
	direccional.position.set(0,20, 0);
	direccional.castShadow = true;
	direccional.shadow.mapSize.width = 1024 * 2; // default
	direccional.shadow.mapSize.height = 1024 * 2; // default
	direccional.shadow.camera.left = -20; direccional.shadow.camera.right = 20; direccional.shadow.camera.top = 20; direccional.shadow.camera.bottom = -20; 
	scene.add( direccional );

	var ambientalUI = new THREE.AmbientLight(0x808080);
	uiScene.add(ambientalUI);

	var direccionalUI = new THREE.DirectionalLight( 0xFFFFFF, 0.5 );
	direccionalUI.position.set(0,1, 0);
	uiScene.add(direccionalUI);

	// Atender al eventos
	window.addEventListener( 'resize', updateAspectRatio );
	window.addEventListener("keydown", onKeyPress);
    //
}

function loadScene() {
	// Construye el grafo de escena
	// - Objetos (geometria, material)
	// - Transformaciones 
	// - Organizar el grafo

	var fontLoader = new THREE.FontLoader();
	fontLoader.load( 'fonts/helvetiker_regular.typeface.json', setupText);

	var texSuelo = new THREE.TextureLoader().load("images/grass.png");
	texSuelo.repeat.set( 2,2 );
	texSuelo.wrapS = texSuelo.wrapT = THREE.MirroredRepeatWrapping;

	var geoSuelo = new THREE.PlaneGeometry(17 * 2,17 * 2,5,5);
	var matSuelo = new THREE.MeshLambertMaterial( {color:0xC0C0C0, map:texSuelo} );
	var suelo = new THREE.Mesh( geoSuelo, matSuelo );
	suelo.rotation.x = -Math.PI/2;
	suelo.receiveShadow = true;
	scene.add(suelo);

	snake = new Snake()
	loadDecoration();
	new THREE.FBXLoader()
	.load('models/playfield.fbx', function (object) {
		scene.add(object);
	});
}

function updateAspectRatio()
{
	// Mantener la relacion de aspecto entre marco y camara

	var aspectRatio = window.innerWidth/window.innerHeight;
	// Renovar medidas de viewport
	renderer.setSize( window.innerWidth, window.innerHeight );
	// Para la perspectiva
	camera.aspect = aspectRatio;
	// Para la ortografica
	uiCamera.left = -aspectRatio;
	uiCamera.right = aspectRatio;

	// Hay que actualizar la matriz de proyeccion
	camera.updateProjectionMatrix();
	uiCamera.updateProjectionMatrix();
}

function onKeyPress(event) {
	if (event.repeat)
		return;
	if (event.key.toLowerCase() == "w" || event.key == "ArrowUp")
		snake.addEvent(1);
	else if (event.key.toLowerCase() == "d" || event.key == "ArrowRight")
		snake.addEvent(2);
	else if (event.key.toLowerCase() == "s" || event.key == "ArrowDown")
		snake.addEvent(3);
	else if (event.key.toLowerCase() == "a" || event.key == "ArrowLeft")
		snake.addEvent(4);
	else if (event.key.toLowerCase() == "c") {
		camera.position.set( 0, 18, 15 );
		cameraControls.target.set( 0, 0, 5.5 );
		camera.lookAt( new THREE.Vector3( 0,0,5.5 ) );
	} else if (event.key == " ") {
		spaceText.visible = !spaceText.visible;
		snake.changePauseState();
	}
}

function update()
{
	// Cambiar propiedades entre frames
	snake.update();
	
	// Actualizar interpoladores
	TWEEN.update();
}

function render() {
	// Blucle de refresco
	requestAnimationFrame( render );
	update();

    renderer.clear();

    renderer.setViewport(0,0,window.innerWidth,window.innerHeight);
	renderer.render( scene, camera );

    renderer.render( uiScene, uiCamera );

    renderer.setViewport( 10,10,window.innerHeight / 3, window.innerHeight / 3);
    renderer.render( scene, minicam );
}

// Acciones
init();
loadScene();
render();
