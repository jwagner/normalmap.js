/* globals $, normalmap */


// relight('gfx/logo.png', 'logo', {
//   brightness: 4.0,
//
// });
//
// relight('gfx/normals.png', 'c', {
//   brightness: 0.4,
//   metalness: 0.95,
//   roughness: 0.5,
//   ambient: 0.05
// });

// hacky hacky hack hack used to go single pass for some demos
window.isMobile =  /Mobile|android/i.test(navigator.userAgent);

function normalize(p){
    var scale = 1/Math.sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2]);
    p[0] *= -scale;
    p[1] *= -scale;
    p[2] *= -scale;
    return p;
}

function bindLight(lights, options){
    options = options || {};
    var left, top;
    var canvas = lights.canvas;
    var color = new Float32Array(options.color||[0.5, 0.5, 0.5]);
    var position = new Float32Array(3);

    var z = options.zOffset || 1;

    function resize(){
        var bounds = $(canvas).offset();
        top = bounds.top;
        left = bounds.left;
    }

    var lastX, lastY;
    lights.configure({onContextRestored: function(){
        render(lastX, lastY);
    }});

    function render(x, y){
        lastX = x;
        lastY = y;
        var p = position;
        if(options.directional) {
            p[0] = (x/window.innerWidth-0.5);
            p[1] = (y/window.innerHeight-0.5);
            p[2] = z;
            normalize(p);
        }
        else {
            p[0] = x/canvas.clientWidth;
            p[1] = y/canvas.clientHeight;
            p[2] = z;
        }
        if(options.directional) {

            lights.addDirectionalLight(p, color);
        }
        else {
            lights.addPointLight(p, color);
        }
        lights.render();
        // lights.addDirectionalLight(normalize(vec3(0.3, -1.3, 1.0)), vec3(0.1, 0.1, 0.1));
    }

    $(window).resize(resize);

    $(document)
        .on('mousemove', function(e){
            move(e.pageX, e.pageY);
        })
        .on('touchmove', function(e){
            move(e.originalEvent.touches[0].pageX, e.originalEvent.touches[0].pageY);
        });

    $(canvas).on('touchstart', function(e){ e.preventDefault(); });

    function move(x, y){
        if(options.directional) {
            render(x, y);
        }
        else {
            render(x - left, y - top);
        }
    }

    resize();
    render(canvas.width*0.25, canvas.height*0.1);
}

function logo(options) {
    $('#logo').normalmap({
        normalMap: 'gfx/logo/normal.png',
        materialMap: 'gfx/logo/material.png',
        ambient: 0,
        metalness: 1.0,
        roughness: 0.3,
        baseColor: normalmap.vec3([1.000, 0.766, 0.336])
    }).then(function(lights){
        bindLight(lights, $.extend({
            color: [0.8, 0.8, 0.8]
        }, options || {}));
    });
}
window.logo = logo;

if(window.location.hash == '#embed') {
    $('body').addClass('normalmap-demo-embedded');
    $('.normalmap-demo-nav a').each(function(){
        $(this).attr('href', $(this).attr('href') + '#embed');
    });
    $('.normalmap-demo-mobile-nav option').each(function(){
        $(this).attr('value', $(this).attr('value') + '#embed');
    });
}

if(location.protocol === 'file:'){
    window.alert('The normalmap.js demos need to be served from a webserver to work.');
}
