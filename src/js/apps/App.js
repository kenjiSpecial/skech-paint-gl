'use strict';

const THREE = require('three');
const dat = require('dat.gui/build/dat.gui.js');
const TweenMax = require('gsap');
let GPUComputationRenderer = require('../vendors/GPUComputationRenderer');

const vertStr = `
precision highp float;
precision highp int;

attribute vec3 position;
attribute vec2 uv;
attribute vec3 normal;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

varying vec3 vNormal;
varying vec2 vUv;

void main(){
  vNormal = normal;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const fragStr = `
precision highp float;
precision highp int;

uniform sampler2D uTexture;

varying vec3 vNormal;
varying vec2 vUv;

void main(){  
    vec3 col = texture2D(uTexture, vUv).rgb;
    float black = (col.r + col.g + col.b)/3.0;
    gl_FragColor = vec4(black, black, black, 1.0);
}
`;

const fragStr2 = `
    precision highp float;
    precision highp int;
    
    uniform sampler2D uTexture;
    uniform vec2 uSize;
        
    varying vec2 vUv;
    
    void main(){
        vec3 mainColor = texture2D(uTexture, vUv).rgb;
        float main = mainColor.r;
        
        float mainDx =  (texture2D(uTexture, vUv + vec2(1.0/uSize.x, 0.0)).r - main + 1.0)/2.0;
        float mainDy =  (texture2D(uTexture, vUv + vec2(0.0, 1.0/uSize.y)).r - main + 1.0)/2.0;
        
        gl_FragColor = vec4(mainDx, mainDy, 0.0, 1.0);
    }
`;

const fragmentShaderVel = `
    uniform sampler2D divergentTex;
    uniform vec2 uSize;
    uniform float uTime;
    uniform int uType;
    
    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }
    
    void main(){
        vec4 vel;
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        
        vec4 pos = texture2D(texturePosition, uv);
        if(pos.w == pos.z){
            vel.z = pos.x;
            vel.w = pos.y;
            vel.xy = vec2(0.0);
        }else{
            vec2 relPos = vec2( ( pos.x + uSize.x/2.)/uSize.x, (pos.y + uSize.y/2.)/uSize.y);
            float theta = atan(pos.y, pos.x);
            vel = texture2D(textureVelocity, uv);
            
            vec2 acl;
            if(uType == 0) {
                acl = (texture2D(divergentTex, relPos).xy - vec2(0.5)) * 2.0 + 0.01 *vec2(cos(theta), sin(theta))* pos.w/pos.z   - vel.xy * 0.1 * pos.w/pos.z;
            }else if(uType == 1){
                acl = (texture2D(divergentTex, relPos).xy - vec2(0.5)) * 10.0 + 0.3 *vec2(-sin(theta), cos(theta)) + vec2(0, -0.01) - vel.xy * 0.5;
            }else if(uType == 2){
                acl = (texture2D(divergentTex, relPos).xy - vec2(0.5)) * 2.0- vec2(0., 0.1) - vel.xy * 0.5;
            }else{
                acl = vec2(0.0);            
            }

            
            vel = vel + vec4(acl, 0.0, 0.0);
        }
        
        gl_FragColor = vec4(vel.xy , vel.zw);
    }
`;

const fragmentShaderPos = `
    uniform vec2 uSize;
    uniform float uTime;
    
    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }
    
    void main(){
         vec2 uv = gl_FragCoord.xy / resolution.xy;
         vec4 pos = texture2D(texturePosition, uv);
         vec3 vel = texture2D(textureVelocity, uv).xyz;
         
         pos.w = pos.w - 1./60.;
         
         if(pos.w < 0.0){
            pos.w = pos.z;
            
            pos.x = uSize.x * (rand(uv + vec2(uTime, 0.0)) - 0.5);
            pos.y = uSize.y * (rand(vec2(uv.y, uv.x)+ vec2(0.0, uTime)) - 0.5);
         }  
         
         gl_FragColor = vec4(pos) + vec4(vel.xy, 0.0, 0.0);
    }
`;

const vertParticleStr = `
precision highp float;
precision highp int;

attribute vec3 position;
attribute vec2 uv;
attribute vec3 normal;
attribute vec2 customUv;
attribute float size;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform sampler2D baseTexture;
uniform float uSize;
uniform float uTime;

varying vec3 vNormal;
varying vec2 vUv;
varying vec4 vColor;
varying float vSize;

void main(){
    vUv = uv;
    vec4 pos = texture2D(texturePosition, customUv);
    vec2 oriPos = texture2D(textureVelocity, customUv).zw ;
    vec2 relUv = vec2( (oriPos.x + uSize * 0.5)/uSize, (oriPos.y + uSize * 0.5)/uSize );
    vColor.rgb = texture2D( baseTexture, relUv).rgb; // * mix(0.5, 1.0, pos.w/pos.z);
    if(pos.w == pos.z) {vColor.a = 0.0;
    }else{
        vColor.a = 1.0; //(1.0 - pos.w/pos.z);
    }
     
    
    
    float rate = clamp(1.0 - uTime/2., 0.2, 0.8);
    vSize = size * rate;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4( pos.rgb + vec3(uv - vec2(0.5), 0.0) * vSize * pos.w/pos.z, 1. );
}
`;

const fragParticleStr = `
precision highp float;
precision highp int;

varying vec2 vUv;
varying vec4 vColor;
varying float vSize;

void main(){
    float dis = distance(vUv, vec2(0.5)) / 0.5;
    float maxAlpha = clamp(200. /vSize, 0.0, 1.0);
    
    gl_FragColor = vec4(vColor.rgb, clamp( step(dis, 0.5), 0.0, 1.0) * maxAlpha * vColor.a );
}
`;

const fragSwapStr = `
precision highp float;
precision highp int;

varying vec2 vUv;

uniform sampler2D curTexture;
uniform sampler2D prevTexture;
uniform float uOpacity;

float blendAdd(float base, float blend) {
	return min(base+blend,1.0);
}

vec3 blendAdd(vec3 base, vec3 blend) {
	return min(base+blend,vec3(1.0));
}

vec3 blendAdd(vec3 base, vec3 blend, float opacity) {
	return (blendAdd(base, blend) * opacity + base * (1.0 - opacity));
}

vec3 blendNormal(vec3 base, vec3 blend) {
	return blend;
}

vec3 blendNormal(vec3 base, vec3 blend, float opacity) {
	return (blendNormal(base, blend) * opacity + base * (1.0 - opacity));
}

float blendOverlay(float base, float blend) {
	return base<0.5?(2.0*base*blend):(1.0-2.0*(1.0-base)*(1.0-blend));
}

vec3 blendOverlay(vec3 base, vec3 blend) {
	return vec3(blendOverlay(base.r,blend.r),blendOverlay(base.g,blend.g),blendOverlay(base.b,blend.b));
}

vec3 blendOverlay(vec3 base, vec3 blend, float opacity) {
	return (blendOverlay(base, blend) * opacity + base * (1.0 - opacity));
}

void main(){
    vec4 curColor = texture2D(curTexture, vUv).rgba;
    vec4 prevColor = texture2D(prevTexture, vUv).rgba;
    
    vec3 outColor = mix(prevColor.rgb, curColor.rgb, curColor.a); // , curColor.a ); 
    gl_FragColor = vec4(outColor, 1.0);
}   
`;

export default class App {
    constructor(params){
        this.params = params || {};

        this._curActiveNum = params.curActiveNum;
        this._textures = params.textures;
        this._mainTexture = this._textures[this._curActiveNum];
        this._isDebug = params.isDebug;

        this.camera = new THREE.OrthographicCamera(-window.innerWidth / 2, window.innerWidth / 2, window.innerHeight / 2, -window.innerHeight / 2, 1, 10000);
        this.camera.position.z = 100;

        this._imgWid = 1024;
        this._imgHig = 1024;

        let glParams = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            stencilBuffer: false
        };
        this._blackAndWhiteRenderTarget = new THREE.WebGLRenderTarget(this._mainTexture.image.width , this._mainTexture.image.height , glParams);
        this._derivativeRenderTarget = new THREE.WebGLRenderTarget(this._mainTexture.image.width , this._mainTexture.image.height , glParams);

        this._particleRenderTarget =  new THREE.WebGLRenderTarget(this._imgWid, this._imgHig, glParams);

        this.minCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10000);
        this.minCamera.position.z = 100;

        this.scene = new THREE.Scene();

        // this.mesh = this.createMesh();
        // this.scene.add(this.mesh);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true
        });

        this._outputRenderTarget = {front: new THREE.WebGLRenderTarget(this._imgWid, this._imgHig, glParams), back: new THREE.WebGLRenderTarget(this._imgWid, this._imgHig, glParams)};
        this._outputRenderTarget.read = this._outputRenderTarget.front;
        this._outputRenderTarget.out  = this._outputRenderTarget.back;

        this._createMesh();
        this._createParticles();


        this.dom = this.renderer.domElement;

        if(this.params.isDebug){
            // this.stats = new Stats();
            // document.body.appendChild(this.stats.dom);
            this._addGui();
        }

        this.clock = new THREE.Clock();

        this._inc = 1;

        this.resize();
    }
    _swap(){
        if(this._outputRenderTarget.read === this._outputRenderTarget.front){
            this._outputRenderTarget.read =  this._outputRenderTarget.back;
            this._outputRenderTarget.out  = this._outputRenderTarget.front;
        }else{
            this._outputRenderTarget.read =  this._outputRenderTarget.front;
            this._outputRenderTarget.out  = this._outputRenderTarget.back;
        }
    }
    _addGui(){
        this.gui = new dat.GUI();
        this.playAndStopGui = this.gui.add(this, '_playAndStop').name('pause');
        this.paintType = 'type0';
        this.paintTypeStopGui = this.gui.add(this, 'paintType', ['type0', 'type1', 'type2', 'type3']).onChange(this._onPaintChange.bind(this));
    }

    _onPaintChange(){
        if(this.paintType === 'type0'){
            this._velVar.material.uniforms.uType.value = 0;
        }else if(this.paintType === 'type1'){
            this._velVar.material.uniforms.uType.value = 1;
        }else if(this.paintType === 'type2'){
            this._velVar.material.uniforms.uType.value = 2;
        }else{
            this._velVar.material.uniforms.uType.value = 3;
        }
    }

    _createParticles(){
        this._gpuComputeSize =80;
        this._gpuCompute = new GPUComputationRenderer( this._gpuComputeSize, this._gpuComputeSize, this.renderer );
        var randomArr = new Float32Array( this._gpuComputeSize * this._gpuComputeSize * 4 );
        var randomArr2 = new Float32Array( this._gpuComputeSize * this._gpuComputeSize * 4 );
        let minVal = -this._imgWid/2; let maxVal = this._imgWid/2;

        for(var ii = 0; ii < this._gpuComputeSize * this._gpuComputeSize; ii++){
            randomArr[4 * ii]     = THREE.Math.randFloat(minVal, maxVal);
            randomArr[4 * ii + 1] = THREE.Math.randFloat(minVal, maxVal);
            randomArr[4 * ii + 2] = THREE.Math.randFloat(1, 4);
            randomArr[4 * ii + 3] = THREE.Math.randFloat(0, randomArr[4 * ii + 2]);
        }

        for(var ii = 0; ii < this._gpuComputeSize * this._gpuComputeSize; ii++){
            randomArr2[4 * ii]     = 0;
            randomArr2[4 * ii + 1] = 0;
            randomArr2[4 * ii + 2] = THREE.Math.randFloat(minVal, maxVal);//+ THREE.Math.randFloat(-100, 100);
            randomArr2[4 * ii + 3] = THREE.Math.randFloat(minVal, maxVal);
        }

        this._pos0 = this._gpuCompute.createCustomTexture(randomArr);
        this._vel0 = this._gpuCompute.createCustomTexture(randomArr2);

        this._velVar = this._gpuCompute.addVariable( 'textureVelocity', fragmentShaderVel, this._vel0 );
        this._posVar = this._gpuCompute.addVariable( 'texturePosition', fragmentShaderPos, this._pos0 );

        this._velVar.material.uniforms.divergentTex = {value: this._derivativeRenderTarget.texture};
        this._velVar.material.uniforms.uSize = {value: new THREE.Vector2(this._imgWid, this._imgHig)};
        this._velVar.material.uniforms.uTime = {value: 0};
        this._velVar.material.uniforms.uType = {value: 0};

        this._posVar.material.uniforms.uSize = {value: new THREE.Vector2(this._imgWid, this._imgHig)};
        this._posVar.material.uniforms.uTime = {value: 0};

        this._gpuCompute.setVariableDependencies( this._velVar, [ this._velVar, this._posVar ] );
        this._gpuCompute.setVariableDependencies( this._posVar, [ this._velVar, this._posVar ] );


        let error =this._gpuCompute.init();
        if( error !== null){
            console.error(error);
        }

        let mat = new THREE.RawShaderMaterial({
            uniforms: {
                texturePosition: {value: null},
                textureVelocity: {value: null},
                baseTexture: {value: this._mainTexture},
                uSize: {value: this._imgWid},
                uTime: {value: 0}
            },
            vertexShader: vertParticleStr,
            fragmentShader: fragParticleStr,
            side: THREE.DoubleSide,
            depthTest: false,
            transparent: true
        });

        this._particleMesh = new THREE.Mesh(this._createGeometry(), mat );; //new THREE.Mesh(new THREE.PlaneGeometry(512  , 512  ), mat );
        this._particleScene = new THREE.Scene();
        this._particleScene.add(this._particleMesh);
        this._particleCamera = new THREE.OrthographicCamera(-this._imgWid/2, this._imgWid/2, this._imgHig/2, -this._imgHig/2, 1, 100000);
        this._particleCamera.position.z = 100;


    }

    _createMesh(){
        // console.log(this._mainTexture);

        let image = this._mainTexture.image;

        let plangeGeometry = new THREE.PlaneGeometry(2, 2);
        let blackMat = new THREE.RawShaderMaterial({
            uniforms: {
                uTexture: {value: this._mainTexture}
            },
            vertexShader: vertStr,
            fragmentShader: fragStr,
        });

        let derivativeMat =new THREE.RawShaderMaterial({
            uniforms: {
                uTexture: {value: this._blackAndWhiteRenderTarget.texture},
                uSize : {value: new THREE.Vector2(256, 256)}
            },
            vertexShader: vertStr,
            fragmentShader: fragStr2,

        });

        this.blackMatMesh = new THREE.Mesh( plangeGeometry, blackMat);
        this.blackScene = new THREE.Scene();
        this.blackScene.add(this.blackMatMesh);
        this.renderer.render(this.blackScene, this.minCamera, this._blackAndWhiteRenderTarget);

        this._derivativeMesh = new THREE.Mesh( plangeGeometry, derivativeMat);
        this._derivativeScene = new THREE.Scene();
        this._derivativeScene.add(this._derivativeMesh);
        this.renderer.render(this._derivativeScene, this.minCamera, this._derivativeRenderTarget);

        var geo = new THREE.PlaneGeometry(1, 1);
        var mat = new THREE.MeshBasicMaterial({map: this._outputRenderTarget.read.texture, transparent: true, opacity: 1.0 });
        this._mainMesh = new THREE.Mesh(geo, mat);
        this._meshSize =  Math.min(this._imgWid, Math.min(window.innerWidth, window.innerHeight) * 0.9 );
        this._mainMesh.scale.set(this._meshSize, this._meshSize, 1);
        this.scene.add(this._mainMesh);



        this._outputMat = new THREE.RawShaderMaterial({
            uniforms: {
                curTexture: {value: this._particleRenderTarget.texture},
                uOpacity: {value: 1},
                prevTexture: {value: this._outputRenderTarget.read.texture }
            },
            vertexShader: vertStr,
            fragmentShader: fragSwapStr,
            transparent: true
        });

        this._outputMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            this._outputMat
        );
        this._outputScene = new THREE.Scene();
        this._outputScene.add(this._outputMesh);
    }

    _createGeometry (){
        let particleNum = this._gpuComputeSize * this._gpuComputeSize;

        let geometry = new THREE.BufferGeometry();
        let positions = new Float32Array( particleNum * 3 * 4);
        let indexArray = [];
        let uvs = new Float32Array(particleNum * 2 * 4);
        let sizes = new Float32Array(particleNum * 1 * 4);
        let customUvs = new Float32Array(particleNum * 2 * 4);

        var c = 0;
        for(var ii = 0; ii < particleNum; ii++){
            let xx = 0;THREE.Math.randFloat(-500, 500);
            let yy = THREE.Math.randFloat(-500, 500);
            let zz = 0; //THREE.Math.randFloat(0, 1000);



            for(var jj = 0; jj < 4; jj++){
                var size = THREE.Math.randFloat(10, 150);

                positions[4 * 3 * ii +3 * jj+ 1] = yy;
                positions[4 * 3 * ii +3 * jj+ 2] = zz;

                uvs[4 * 2 * ii + 2 * jj] = parseInt(jj /2);
                uvs[4 * 2 * ii + 2 * jj + 1] = jj % 2;

                sizes[4 * 1 * ii + 1 * jj] = size;

                customUvs[4 * 2 * ii + 2 * jj] = parseInt(ii % this._gpuComputeSize) / this._gpuComputeSize;
                customUvs[4 * 2 * ii + 2 * jj + 1] = parseInt(ii / this._gpuComputeSize) / this._gpuComputeSize;
            }

            indexArray[c++] = 4 * ii + 0;
            indexArray[c++] = 4 * ii + 1;
            indexArray[c++] = 4 * ii + 2;
            indexArray[c++] = 4 * ii + 2;
            indexArray[c++] = 4 * ii + 1;
            indexArray[c++] = 4 * ii + 3;
        }



        indexArray = new Uint32Array(indexArray);

        geometry.addAttribute('position', new THREE.BufferAttribute( positions, 3 ) );
        geometry.addAttribute('uv', new THREE.BufferAttribute( uvs, 2 ) );
        geometry.addAttribute('customUv', new THREE.BufferAttribute( customUvs, 2 ) );
        geometry.addAttribute('size', new THREE.BufferAttribute( sizes, 1 ) );

        geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));


        return geometry;
    }


    animateIn(){
        this.isLoop = true;
        TweenMax.ticker.addEventListener('tick', this.loop, this);
    }

    loop(){
        this._posVar.material.uniforms.uTime.value = this._posVar.material.uniforms.uTime.value + 1/60;
        this._velVar.material.uniforms.uTime.value = this._posVar.material.uniforms.uTime.value;

        this._gpuCompute.compute();

        this._particleMesh.material.uniforms.texturePosition.value = this._gpuCompute.getCurrentRenderTarget( this._posVar ).texture;
        this._particleMesh.material.uniforms.textureVelocity.value = this._gpuCompute.getCurrentRenderTarget( this._velVar ).texture;
        this._particleMesh.material.uniforms.uTime.value = this._particleMesh.material.uniforms.uTime.value + 1/60;

        this.renderer.render(this._particleScene, this._particleCamera, this._particleRenderTarget);
        this._outputMat.uniforms.prevTexture.value = this._outputRenderTarget.read.texture;
        this.renderer.render(this._outputScene, this.minCamera, this._outputRenderTarget.out);
        this._swap();

        this._mainMesh.material.map = this._outputRenderTarget.read.texture;

        this.renderer.render(this.scene, this.camera);
        if(this.stats) this.stats.update();

    }

    animateOut(){
        TweenMax.ticker.removeEventListener('tick', this.loop, this);
    }

    onMouseMove(mouse){

    }

    onKeyDown(ev){
        switch(ev.which){
            case 27:
                this._playAndStop();
                break;
        }
    }

    _playAndStop(){
        this.isLoop = !this.isLoop;
        if(this.isLoop){
            TweenMax.ticker.addEventListener('tick', this.loop, this);
            this.playAndStopGui.name('pause');
        }else{
            TweenMax.ticker.removeEventListener('tick', this.loop, this);
            this.playAndStopGui.name('play');
        }
    }


    resize(){
        this.camera.left = -window.innerWidth/2;
        this.camera.right = window.innerWidth/2;
        this.camera.top = window.innerHeight/2;
        this.camera.bottom = -window.innerHeight/2;
        this.camera.updateProjectionMatrix();

        this._meshSize =  Math.min(this._imgWid, Math.min(window.innerWidth, window.innerHeight) * 0.9 );
        this._mainMesh.scale.set(this._meshSize, this._meshSize, 1);

        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    destroy(){

    }
    updateTexture(num){
        this._mainTexture = this._textures[num];

        this.blackMatMesh.material.uniforms.uTexture.value = this._mainTexture;
        this.renderer.render(this.blackScene, this.minCamera, this._blackAndWhiteRenderTarget);
        this.renderer.render(this._derivativeScene, this.minCamera, this._derivativeRenderTarget);
        this._velVar.material.uniforms.divergentTex = {value: this._derivativeRenderTarget.texture};
        this._particleMesh.material.uniforms.baseTexture.value = this._mainTexture;
        this._particleMesh.material.uniforms.uTime.value = 0;
        // TweenMax.killTweensOf(this._particleMesh.material.uniforms.uTime);
        // TweenMax.to(this._particleMesh.material.uniforms.uTime, 0.4, {value: 0});
    }

}
