/* globals $, normalmap */
(function(){

var vec3 = normalmap.vec3;
var gold = vec3(1.000, 0.766, 0.336);

var lastTest = $.when(true);
var nTests = 0;
var nTestsSucceeded = 0;

function test(name, body){
    // if(name !== 'material metalness roughness') return;
    var canvas = $('<canvas>')[0];
    var expectedSrc = 'expected/' + name.replace(/ /g, '-') + '.png';
    var expected;
    // stupid jquery defereds
    return lastTest = lastTest.then(function(){}, function(){ return $.when(true);})
    .then(function(){
        nTests++;
        return $.fn.normalmap._loadImage(expectedSrc);
    })
    .then(function(expected_){
        expected = expected_;
    }, function(e){ return $.when(e); })
    .then(function(){
        return body(canvas);
    }).then(function(){
        var difference = diff(canvas, expected);
        var failed = difference.total > 0.005;
        if(!failed) nTestsSucceeded++;
        $('body')
            .append(
                $('<h2>')
                    .text(name + ' (' + Math.floor(difference.total * 100000)/100000 + ')')
                    .css('color', failed ? 'red' : 'green')
            )
            .append(
                $('<div>')
                    // copy the canvas to work around the webgl context limit
                    .append(copyCanvas(canvas))
                    .append(expected ? expected : 'missing ' + expectedSrc)
                    .append(difference.canvas)
            );
    });
}

function copyCanvas(a){
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    c.width = a.width;
    c.height = a.height;
    ctx.drawImage(a, 0, 0);
    return c;
}

// currently ignores alpha
function diff(a, b){
    var c = document.createElement('canvas');
    c.width = a.width;
    c.height = a.height;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(a, 0, 0);
    if(!b || !b.complete) return {
        canvas: c,
        total: 1
    };
    var aData = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(b, 0, 0);
    var bImgData = ctx.getImageData(0, 0, c.width, c.height);
    var bData = bImgData.data;
    var total = 0;
    for(var i = 0; i < bData.length; i+=4){
        for(var j = 0; j < 4; j++) {
            var aAlpha = j < 3 ? aData[i+3]/256 : 1;
            var bAlpha = j < 3 ? bData[i+3]/256 : 1;
            var d = (aData[i+j]/256*aAlpha-bData[i+j]/256*bAlpha);
            total += d*d;
        }
        bData[i] = 127 + aData[i]*0.5 - bData[i]*0.5;
        bData[i+1] = 127 + aData[i+1]*0.5 - bData[i+1]*0.5;
        bData[i+2] = 127 + aData[i+2]*0.5 - bData[i+2]*0.5;
    }
    ctx.putImageData(bImgData, 0, 0);
    return {
        canvas: c,
        total: total/(c.width*c.height)
    };
}

test('simple normals', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png'
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('many lights', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
    }).then(function(lights){
        for(var i = 0; i < 10; i++){
            lights.addPointLight(
                vec3(0.5, 0.5, 0.5),
                vec3(0.1, 0.1, 0.1)
            );
        }
        lights.render();
    });
});

test('simple normals top left', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png'
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.0, 0.0, 0.5),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('simple normals red', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png'
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 0, 0)
        );
        lights.render();
    });
});

test('simple normals directional', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png'
    }).then(function(lights){
        lights.addDirectionalLight(
            vec3(0.5, 0.5, -0.1),
            vec3(1, 1, 1)
        );
        lights.render();
    });
});

test('four lights', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png'
    }).then(function(lights){
        lights.addPointLight(
            vec3(-1.0, 0.4, 0.1),
            vec3(4, 1.2, 0.1)
        );
        lights.addPointLight(
            vec3(2.0, 0.4, 0.1),
            vec3(0.1, 1, 4)
        );
        lights.addPointLight(
            vec3(0.4, -1.0, 0.1),
            vec3(4, 0.1, 1.2)
        );
        lights.addPointLight(
            vec3(0.4, 2, 0.1),
            vec3(0.1, 1, 4)
        );
        lights.render();
    });
});

test('metal', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 1.0,
        baseColor: gold,
        roughness: 0.1
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('plastic', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 0.0,
        baseColor: gold,
        roughness: 0.1
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('roughness', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 0.0,
        baseColor: gold,
        roughness: 0.5
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('baseColorMap', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 0.0,
        baseColor: gold,
        baseColorMap: 'checker.png',
        roughness: 0.5
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('ambientMap', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 0.0,
        baseColor: gold,
        ambientMap: 'checker-r.png',
        roughness: 0.5
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('ambientMapAlpha', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 0.0,
        baseColor: gold,
        ambientMap: 'checker-a.png',
        roughness: 0.5
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('ambientMapAlpha singlePass', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 0.0,
        baseColor: gold,
        ambientMap: 'checker-a.png',
        roughness: 0.5,
        singlePass: true
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
    });
});

test('ambientMapAlpha many lights', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        metalness: 0.0,
        baseColor: gold,
        ambientMap: 'checker-a.png',
        roughness: 0.5
    }).then(function(lights){
        for(var i = 0; i < 10; i++){
            lights.addPointLight(
                vec3(0.5, 0.5, 1),
                vec3(0.1, 0.1, 0.1)
            );
        }
        lights.render();
    });
});

test('material metalness roughness', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal-sharp.png',
        baseColor: gold,
        materialMap: 'material.png'
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('material occlusion', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        baseColor: gold,
        materialMap: 'checker-b.png'
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('repeat', function(canvas){
    canvas.width = 512;
    canvas.height = 512;
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        repeat: true
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('subSurfaceScattering 1', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal-sharp.png',
        baseColor: gold,
        subSurfaceScattering: 0,
        metalness: 0,
        roughness: 0.0
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.25, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('subSurfaceScattering 3', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal-sharp.png',
        baseColor: gold,
        subSurfaceScattering: 3,
        metalness: 0,
        roughness: 0.5
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.25, 1),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});


test('npot', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal-npot.png'
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('configure values', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
    }).then(function(lights){
        lights.configure({
            baseColor: gold,
            metalness: 0,
            roughness: 0.5
        });
        lights.addPointLight(
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('configure normalMap', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
    }).then(function(lights){
        return $.fn.normalmap._loadImage('normal-sharp.png').then(function(n){
            lights.configure({
                normalMap: n
            });
            lights.addPointLight(
                vec3(0.5, 0.5, 0.5),
                vec3(1.0, 1.0, 1.0)
            );
            lights.render();
        });
    });
});

test('configure normalMap', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
    }).then(function(lights){
        return $.fn.normalmap._loadImage('normal-sharp.png').then(function(n){
            lights.configure({
                normalMap: n
            });
            lights.addPointLight(
                vec3(0.5, 0.5, 0.5),
                vec3(1.0, 1.0, 1.0)
            );
            lights.render();
        });
    });
});

test('configure materialMap', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal-sharp.png',
        baseColor: vec3(0.5, 0.5, 0.5)
    }).then(function(lights){
        return $.fn.normalmap._loadImage('material.png').then(function(img){
            lights.configure({
                materialMap: img
            });
            lights.addPointLight(
                vec3(0.5, 0.5, 1.0),
                vec3(1.0, 1.0, 1.0)
            );
            lights.render();
        });
    });
});

test('configure ambientMap', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal-sharp.png',
        baseColor: vec3(0.5, 0.5, 0.5)
    }).then(function(lights){
        return $.fn.normalmap._loadImage('checker.png').then(function(img){
            lights.configure({
                ambientMap: img
            });
            lights.addPointLight(
                vec3(0.5, 0.5, 1.0),
                vec3(1.0, 1.0, 1.0)
            );
            lights.render();
        });
    });
});

test('antiAliasing', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal-sharp.png',
        baseColor: vec3(1.0, 1.0, 1.0),
        roughness: 0.05,
        antiAliasing: true
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.0, 1.0),
            vec3(1.0, 1.0, 1.0)
        );
        lights.render();
    });
});

test('muliple render', function(canvas){
    return $(canvas).normalmap({
        normalMap: 'normal.png',
        baseColor: vec3(0.5, 0.5, 0.5)
    }).then(function(lights){
        lights.addPointLight(
            vec3(0.5, 0.5, 1.0),
            vec3(1.0, 0.0, 0.0)
        );
        lights.render();
        lights.addPointLight(
            vec3(0.5, 0.5, 1.0),
            vec3(0.0, 1.0, 0.0)
        );
        lights.render();
    });
});

lastTest.then(function(){
    var success = nTestsSucceeded == nTests;
    $('body').prepend(
        $('<div class=test-results>')
            .text('summary: ' + nTestsSucceeded + '/' + nTests + ' succeeded')
            .css('color', success ? 'green' : 'red')
            .addClass('test-results-' + (success ? 'passed' : 'failed'))
    );
});

})();
