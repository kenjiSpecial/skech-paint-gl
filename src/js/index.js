'use strict';
const THREE = require('three');
// import App from './apps/App2';
import App from './apps/App';
// import App from './apps/App4';
// import App from './apps/OrthoApp';

let app;
let texture0, texture1, texture2;
let cnt = 0;
let base = './';
let urls = ['img0.png', 'img1.png', 'img2.png', 'img3.png'];
let textures = [];
let lists = [];
let curActiveNum = 0;

(() =>{
    initLoad();
})();

function initLoad(){
    let loader = new THREE.TextureLoader();
    urls.forEach((url)=>{
        loader.load(base + url, (texture)=>{
            textures.push(texture);
            cnt++;

            if(cnt === 4) onload();
        });

    });

}

function onload(){
    var parent = document.createElement('div');
    parent.style.zIndex = '9999';
    parent.style.position = 'absolute';
    parent.style.top = '10px';
    parent.style.left = '10px';
    document.body.appendChild(parent);

    for(var ii = 0; ii < textures.length; ii++){
        var div = document.createElement('div');
        div.style.marginBottom = '20px';

        var image = new Image();
        image.src = textures[ii].image.src;
        image.width = 64;
        image.height = 64;
        div.appendChild(image);
        parent.appendChild(div);

        div.dataset.index = ii;
        div.addEventListener('click', clickHandler);

        if(ii === 0){
            div.style.opacity = 1;
        }else{
            div.style.opacity = 0.4;
            div.style.cursor = 'pointer';
        }

        lists.push(div);
    }

    init();
    start();


}

function clickHandler(ev){
    let activeNum = parseInt(ev.currentTarget.dataset.index);
    if(activeNum === curActiveNum) return;
    curActiveNum = activeNum;

    for(var ii = 0; ii < urls.length; ii++){
        if(ii == activeNum) {
            lists[ii].style.opacity = 1;
            lists[ii].style.cursor = 'default';
        }else{
            lists[ii].style.opacity = 0.4;
            lists[ii].style.cursor = 'pointer';
        }
    }


    app.updateTexture(curActiveNum);
}

function init(){
    app = new App({
        textures : textures,
        curActiveNum: curActiveNum,
        isDebug: true
    });

    document.body.appendChild(app.dom);
    document.addEventListener('mousemove', onDocumentMouseMove, false);
    // document.addEventListener('click', onDocumentClick, false);
}

function start(){
    app.animateIn();
}


function onDocumentMouseMove(event){
    let mouseX = ( event.clientX / window.innerWidth ) * 2 - 1;
    let mouseY = -( event.clientY / window.innerHeight ) * 2 + 1;

    if(app) app.onMouseMove({x: mouseX, y: mouseY});
}

function onDocumentClick(event){
    let mouseX = ( event.clientX / window.innerWidth ) * 2 - 1;
    let mouseY = -( event.clientY / window.innerHeight ) * 2 + 1;

    if(app) app.clickHandler({x: mouseX, y: mouseY});
}

window.addEventListener('resize', function(){
    if(app) app.resize();
});

window.addEventListener('keydown', function(ev){
    if(app) app.onKeyDown(ev);
});
