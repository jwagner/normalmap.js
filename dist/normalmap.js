(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.normalmap = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
function FBO(gl, width, height, type, format, depth){
    width = width || gl.drawingBufferWidth;
    height = height || gl.drawingBufferHeight;
    this.width = width;
    this.height = height;
    this.gl = gl;

    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, format || gl.RGBA, width, height, 0, format || gl.RGBA, type || gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if(depth){
        this.depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

    this.supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
FBO.prototype = {
    bind: function () {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    },
    unbind: function() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
};
module.exports = FBO;

},{}],2:[function(require,module,exports){

var shaderSources = ({"shaders":({"ambient":require("./shaders/ambient.glsl"),"brdf":require("./shaders/brdf.glsl"),"common":require("./shaders/common.glsl"),"fxaa":require("./shaders/fxaa.glsl"),"light-fragment":require("./shaders/light-fragment.glsl"),"render-fragment":require("./shaders/render-fragment.glsl"),"render-vertex":require("./shaders/render-vertex.glsl"),"vertex":require("./shaders/vertex.glsl")})}).shaders;
var ShaderManager = require('./shader-manager');
var FBO = require('./fbo');

const NORMAL_SAMPLER = 0;
const BASE_COLOR_SAMPLER = 1;
const MATERIAL_SAMPLER = 2;
const AMBIENT_SAMPLER = 3;
const FRAMEBUFFER_SAMPLER = 4;

var IMMUTABLE_PROPERTIES = 'canvas repeat singlePass'.split();

function normalmap(options){
    options = assign({
        metalness: 1,
        roughness: 1,
        ambient: 1,
        baseColor: new Float32Array([0.5, 0.5, 0.5])
    }, options);
    var canvas = options.canvas;

    if(canvas == null) throw new Error('normalmap() canvas is required');

    if(options.normalMap == null) throw new Error('normalmap() normalMap is required');

    var defines = {};
    defineDefines(defines, options);
    if(options.debug) { console.log('defines', defines); }

    var normalMapWidth = options.normalMap.naturalWidth || options.normalMap.width;
    var normalMapHeight = options.normalMap.naturalHeight || options.normalMap.height;

    var textureAspect = normalMapWidth / normalMapHeight;
    var viewportAspect, scale;

    function resize(){
        viewportAspect = canvas.width / canvas.height;
        scale = options.repeat ? (canvas.width / normalMapWidth) : 1;
        if(gl) {
            if((!options.singlePass)){
                fbo.unbind();
                fbo = getFBO(gl);
                fbo.bind();
            }
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    }

    resize();

    // these need to be reset on gl reinitializations
    var shaderManager;
    var pointLightShader, directionalLightShader, renderShader;
    var screenQuad, fbo;
    var gl;

    function initGl(){
        var glOptions = {
            // false is not supported by iOS
            premultipliedAlpha: true,
            alpha: true,
            depth: false
        };

        gl = canvas.getContext('webgl', glOptions) || canvas.getContext('experimental-webgl', glOptions);

        if(!gl){
            console.warn('webgl not supported!');
            return;
        }

        gl.blendColor(0, 0, 0, 0);
        gl.clearColor(0, 0, 0, 0);
        screenQuad = getScreenQuadBuffer(gl);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, screenQuad);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.enable(gl.DITHER);
        gl.disable(gl.DEPTH_TEST);

        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ZERO);

        shaderManager = new ShaderManager(gl, shaderSources);
        if(!options.singlePass){
            fboType = null;
            fbo = getFBO(gl);
            fbo.bind();
        }
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        configureGl();
        window.gl = gl;
    }

    function configureGl(){
        setupTextures(gl, options);
        buildShaders();
    }

    function buildShader(name, additionalDefines){
        return shaderManager.get('vertex', name + '-fragment',
            assign(additionalDefines||{}, defines));
    }

    function buildShaders(){
        defineDefines(defines, options);
        pointLightShader = buildShader('light', {IS_POINT_LIGHT: 1});
        directionalLightShader = buildShader('light', {IS_DIRECTIONAL_LIGHT: 1});
        renderShader = buildShader('render');
    }

    canvas.addEventListener("webglcontextlost", function(e) {
        gl = null;
        console.warn('lost webgl context!');
        e.preventDefault();
    }, false);

    canvas.addEventListener("webglcontextrestored", function(){
        console.warn('webgl context restored!');
        initGl();
        if(options.onContextRestored) {
            options.onContextRestored();
        }

    }, false);

    initGl();

    function getGenericUniforms(){
        return {
            uTextureAspect: options.repeat ? viewportAspect*textureAspect : 1,
            uScale: scale
        };
    }

    function getGenericLightUniforms(color){
        var uniforms = assign(getGenericUniforms(), {
            uLightColor: color,
            uMetalness: options.metalness,
            uRoughness: options.roughness,
            uBaseColor: options.baseColor,
            uNormalSampler: NORMAL_SAMPLER
        });
        if(options.baseColorMap) {
            uniforms.uBaseColorSampler = BASE_COLOR_SAMPLER;
        }
        if(options.materialMap) {
            uniforms.uMaterialSampler = MATERIAL_SAMPLER;
        }
        if(options.subSurfaceScattering){
            uniforms.uSubSurfaceScattering = options.subSurfaceScattering;
        }
        if(options.singlePass && options.ambientMap){
            uniforms.uAmbientSampler = AMBIENT_SAMPLER;
            uniforms.uAmbient = options.ambient;
        }
        return uniforms;
    }

    var fboType = null;
    var fboFormat;
    function getFBO(gl){
        var fbo;
        if(fboType) return new FBO(gl, undefined, undefined, fboType, fboFormat);
        var halfFloat = gl.getExtension('OES_texture_half_float');
        var halfFloatLinear = gl.getExtension('OES_texture_half_float_linear');
        if(halfFloat && halfFloatLinear && true){
            fbo = new FBO(gl, undefined, undefined, halfFloat.HALF_FLOAT_OES);
            if(fbo.supported){
                fboType = halfFloat.HALF_FLOAT_OES;
                return fbo;
            }
        }
        var float = gl.getExtension('OES_texture_float');
        var floatLinear = gl.getExtension('OES_texture_float_linear');
        if(float && floatLinear && false){
            fbo = new FBO(gl, undefined, undefined, gl.FLOAT);
            if(fbo.supported) {
                fboType = gl.FLOAT;
                return fbo;
            }
        }
        fboType = gl.UNSIGNED_BYTE;
        var extSRGB = gl.getExtension('EXT_sRGB');
        if(extSRGB){
            console.log('sRGB present');
            fbo = new FBO(gl, undefined, undefined, gl.UNSIGNED_BYTE, extSRGB.SRGB_ALPHA_EXT);
            if(fbo.supported) {
                console.log('sRGB supported');
                fboFormat = extSRGB.SRGB_ALPHA_EXT;
            }
            else{
                console.log('sRGB FBO not supported');
            }
        }
        return new FBO(gl);
    }

    var lights = {
        canvas: canvas,
        addPointLight: function(position, color){
            if(!gl) return;
            if(options.singlePass){
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            pointLightShader.use();
            var uniforms = getGenericLightUniforms(color);
            uniforms.uLightPosition = position;
            uniforms.uViewportAspect = viewportAspect;
            pointLightShader.uniforms(uniforms);
            drawBuffer(gl);
        },
        addDirectionalLight: function(direction, color){
            if(!gl) return;
            if(options.singlePass){
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            directionalLightShader.use();
            var uniforms = getGenericLightUniforms(color);
            uniforms.uLightDirection = direction;
            directionalLightShader.uniforms(uniforms);
            drawBuffer(gl);
        },
        render: function(){
            if(!gl) return;
            if(options.singlePass) return;
            fbo.unbind();
            gl.activeTexture(gl.TEXTURE0 + FRAMEBUFFER_SAMPLER);
            gl.bindTexture(gl.TEXTURE_2D, fbo.texture);

            renderShader.use();
            var uniforms = {
                uFrameBufferSampler: FRAMEBUFFER_SAMPLER
            };

            if(options.antiAliasing) {
                uniforms.uFrameBufferResolution = new Float32Array([fbo.width, fbo.height]);
            }

            if(options.ambientMap){
                assign(uniforms, getGenericUniforms());
                uniforms.uAmbientSampler = AMBIENT_SAMPLER;
                uniforms.uAmbient = options.ambient;
            }

            renderShader.uniforms(uniforms);
            gl.clear(gl.COLOR_BUFFER_BIT);
            drawBuffer(gl);
            fbo.bind();
            gl.clear(gl.COLOR_BUFFER_BIT);
        },
        configure: function(changes){
            IMMUTABLE_PROPERTIES.forEach(function(prop){
                if(prop in changes) {
                    throw new TypeError("can't configure()" + prop);
                }
            });
            assign(options, changes);
            if(gl) configureGl();
        },
        resize: resize
    };

    return lights;
}
module.exports = normalmap;

function defineDefines(defines, options){
    defines.USE_BASE_COLOR_MAP = options.baseColorMap && 1;
    defines.USE_MATERIAL_MAP = options.materialMap && 1;
    defines.USE_AMBIENT_MAP = options.ambientMap && 1;
    defines.USE_SSS = options.subSurfaceScattering && 1;
    defines.USE_FXAA = options.antiAliasing ? 1 : undefined;
    defines.USE_SINGLE_PASS = options.singlePass ? 1 : undefined;
}

function getScreenQuadBuffer(gl){
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    var vertices = new Float32Array([
        1.0,  1.0,  0.0,
        -1.0, 1.0,  0.0,
        1.0,  -1.0, 0.0,
        -1.0, -1.0, 0.0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    return buffer;
}

function imageToTexture(gl, image, type, repeat){
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    var isPot = isImagePowerOfTwo(image);
    gl.texImage2D(gl.TEXTURE_2D, 0, type || gl.RGBA, type || gl.RGBA, gl.UNSIGNED_BYTE, image);
    if(isPot){
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    if(repeat && isPot){
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    if(isPot){
        gl.generateMipmap(gl.TEXTURE_2D);
    }
    // gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

function setupTextures(gl, options){
    if(options.normalMap == null) throw new Error('normalmap() normalMap attribute is required');

    gl.activeTexture(gl.TEXTURE0 + NORMAL_SAMPLER);
    imageToTexture(gl, options.normalMap, gl.RGBA, options.repeat);

    if(options.baseColorMap) {
        gl.activeTexture(gl.TEXTURE0 + BASE_COLOR_SAMPLER);
        imageToTexture(gl, options.baseColorMap, gl.RGB, options.repeat);
    }

    if(options.materialMap) {
        gl.activeTexture(gl.TEXTURE0 + MATERIAL_SAMPLER);
        imageToTexture(gl, options.materialMap, gl.RGB, options.repeat);
    }

    if(options.ambientMap) {
        gl.activeTexture(gl.TEXTURE0 + AMBIENT_SAMPLER);
        imageToTexture(gl, options.ambientMap, gl.RGBA, options.repeat);
    }
}

function drawBuffer(gl){
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function assign(a){
    for(var i = 1; i < arguments.length; i++){
        var b = arguments[i];
        for(var key in b){
            if(b.hasOwnProperty(key)) a[key] = b[key];
        }
    }
    return a;
}

function vec3(x, y, z){
    var v = new Float32Array(3);
    v[0] = x; v[1] = y; v[2] = z;
    return v;
}
normalmap.vec3 = vec3;

function isImagePowerOfTwo(image){
    return isPowerOfTwo(image.naturalWidth || image.width) &&
        isPowerOfTwo(image.naturalHeight || image.height);
}

function isPowerOfTwo(x) {
  return ((x !== 0) && !(x & (x - 1)));
}

},{"./fbo":1,"./shader-manager":3,"./shaders/ambient.glsl":5,"./shaders/brdf.glsl":6,"./shaders/common.glsl":7,"./shaders/fxaa.glsl":8,"./shaders/light-fragment.glsl":9,"./shaders/render-fragment.glsl":10,"./shaders/render-vertex.glsl":11,"./shaders/vertex.glsl":12}],3:[function(require,module,exports){
var Shader = require('./shader');

function ShaderManager(gl, sources, options){
    this.gl = gl;
    this.sources = sources;
    this.shaders = [];
    options = options || {};
    this.prefix = options.prefix || '';
    this.sourceIds = Object.create(null);
    this.sourceId = 1;
}
module.exports = ShaderManager;
ShaderManager.prototype = {
    includeExpression: /#include "([^"]+)"/,
    preprocess: function(name, content, included) {
        var sourceId = this.getSourceId(name);
        var lines = content.split('\n');
        var output = ['#line 1 ' + sourceId];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var match = line.match(this.includeExpression);
            if(match){
                var include = match[1];
                if(!included[include]){
                    output.push(this.getSource(include, {}, included));
                    output.push('#line ' + (i+2) + ' ' + sourceId);
                    included[include] = true;
                }
                else {
                    output.push('// ' + line);
                }
            }
            else {
                output.push(line);
            }
        }
        return output.join('\n');
    },
    getSource: function(name, defines, included) {
        name = name.replace(/\.\w+$/, '');
        var content = this.sources[this.prefix + name];
        if(content == null) {
            throw new Error('shader not found ' + name);
        }
        return glslDefines(defines) + this.preprocess(name, content, included);
    },
    getSourceId: function(name){
        if(!(name in this.sourceIds)){
            this.sourceIds[name] = this.sourceId++;
        }
        return this.sourceIds[name];
    },
    getSourceName: function(sourceId) {
        var sourceIds = this.sourceIds;
        for(var name in sourceIds){
            if(sourceIds[name] === sourceId) return name;
        }
    },
    get: function(vertex, frag, defines) {
        if(!frag) {
            frag = vertex;
        }
        var key = JSON.stringify([vertex, frag, defines]);
        if(!(key in this.shaders)){
            try {
                this.shaders[key] = new Shader(this.gl,
                    this.getSource(vertex, defines, {}),
                    this.getSource(frag, defines, {}));
            }
            catch(e){
                throw this.resolveError(e);
            }
        }
        return this.shaders[key];
    },
    resolveError: function(e) {
        if(!e.message || !e.message.match(/Shader (compiler|linker) error:/)) {
            return e;
        }
        var sourceIdExpression = /(ERROR: )(\d+)(:\d+:)/g;
        var message = e.message.replace(sourceIdExpression, function(_, head, sourceId, tail){
            var source = this.getSourceName(sourceId*1  ) || 'unknown-' + sourceId;
            return head + source + tail;
        }.bind(this));
        if(message === e.message) return e;
        return new Error(message);

    }
};

function glslDefines(defines){
    if(!defines) return '';
    var output = [];
    for(var key in defines){
        if(defines[key] != null){
            output.push('#define ' + key + ' ' + defines[key]);
        }
    }
    return output.join('\n');
}

},{"./shader":4}],4:[function(require,module,exports){
function Shader(gl, vertexSource, fragmentSource){
    this.gl = gl;
    console.log(fragmentSource);
    this.program = buildProgram(gl, vertexSource, fragmentSource);
    this.uniformInfos = reflectUniformInformation(gl, this.program);
    this.uniformValues = Object.create(null);
    this.uniformTypes = Object.create(null);
    this.attributeLocations = Object.create(null);
}
module.exports = Shader;
Shader.prototype = {
    use: function() {
        this.gl.useProgram(this.program);
    },
    // does not check for hasOwnProperty on values
    // allows for prototypical inheritance
    uniforms: function (values) {
        for(var name in values) {
            this.setUniform(name, values[name]);
        }
    },
    setUniform: function(name, value){
        var info = this.uniformInfos[name];
        if(!info) {
            console.warn('shader missing uniform', name);
            return;
        }
        var type = info.type;
        if(isUniformTypeScalar(this.gl, type)){
            if(value === this.uniformValues[name]){
                return;
            }
            else {
                this.uniformValues[name] = value;
            }
        }
        else {
            var oldValue = this.uniformValues[name];
            if(oldValue !== undefined) {
                if(compareAndSet(oldValue, value)) return;
            }
            else {
                this.uniformValues[name] = new Float32Array(value);
            }
        }
        setUniform(this.gl, info.location, type, value);
    },
    getUniformLocation: function(name) {
        if(!(name in this.uniformLocations)){
            var location = this.gl.getUniformLocation(this.program, name);
            if(location < 0){
                console.warn('shader missing uniform', name);
            }
            this.uniformLocations[name] = location;
        }
        return this.uniformLocations[name];
    },
    getAttribLocation: function(name) {
        if(!(name in this.attributeLocations)){
            var location = this.gl.getAttribLocation(this.program, name);
            if(location < 0){
                console.warn('shader missing attribute', name);
            }
            this.attributeLocations[name] = location;
        }
        return this.attributeLocations[name];
    }
};

function isUniformTypeScalar(gl, type){
    switch(type){
        case gl.FLOAT:
        case gl.INT:
        case gl.UNSIGNED_INT:
        case gl.SAMPLER_2D:
        case gl.SAMPLER_CUBE:
        case gl.BOOL:
            return true;
        default:
            return false;
    }
}

function setUniform(gl, location, type, value){
    switch(type) {
        case gl.FLOAT:
            gl.uniform1f(location, value);
            break;
        case gl.INT:
        case gl.UNSIGNED_INT:
        case gl.SAMPLER_2D:
        case gl.SAMPLER_CUBE:
        case gl.BOOL:
            gl.uniform1i(location, value);
            break;
        case gl.FLOAT_VEC3:
            gl.uniform3fv(location, value);
            break;
        case gl.FLOAT_VEC2:
            gl.uniform2fv(location, value);
            break;
        case gl.FLOAT_VEC4:
            gl.uniform4fv(location, value);
            break;
        case gl.FLOAT_MAT4:
            gl.uniformMatrix4fv(location, value);
            break;
        case gl.FLOAT_MAT3:
            gl.uniformMatrix3fv(location, value);
            break;
        case gl.FLOAT_MAT2:
            gl.uniformMatrix2fv(location, value);
            break;
        case gl.INT_VEC3:
            gl.uniform3iv(location, value);
            break;
        case gl.INT_VEC2:
            gl.uniform2iv(location, value);
            break;
        case gl.INT_VEC4:
            gl.uniform4iv(location, value);
            break;
        default:
            console.warn('Unknown uniform type', name, type);
    }

}

function reflectUniformInformation(gl, program){
    var uniforms = Object.create(null);
    var nActiveUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for(var i = 0; i < nActiveUniforms; i++){
        var uniform = gl.getActiveUniform(program, i);
        uniforms[uniform.name] = {
            type: uniform.type,
            size: uniform.size,
            location: gl.getUniformLocation(program, uniform.name)
        };
    }
    return uniforms;
}

function compileShader(gl, type, source){
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        throw new Error('Shader compiler error: "' + gl.getShaderInfoLog(shader) + '"');
    }
    return shader;
}

function buildProgram(gl, vertexShaderSource, fragmentShaderSource){
    var fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    var vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
        throw new Error('Shader linker error: ' + gl.getProgramInfoLog(program));
    }
    return program;
}

// sets a to b
// returns true if a was equal to b already
function compareAndSet(a, b){
    var equal = true;
    for(var i = 0; i < a.length; i++){
        if(a[i] !== b[i]){
            a[i] = b[i];
            equal = false;
        }
    }
    return equal;
}

},{}],5:[function(require,module,exports){
module.exports = "#ifdef USE_AMBIENT_MAP\nuniform sampler2D uAmbientSampler;\nuniform float uAmbient;\n\nvoid addAmbient(inout vec4 fragColor){\n    vec4 ambient = texture2D(uAmbientSampler, vUv);\n    ambient.rgb *= uAmbient * ambient.a;\n    fragColor.rgb = fragColor.rgb*fragColor.a + ambient.rgb;\n    // this is a bit of a hack but it allows for a separate alpha in both\n    // while not messing up when they are blended\n    fragColor.a = max(fragColor.a, ambient.a);\n}\n#endif\n";

},{}],6:[function(require,module,exports){
module.exports = "#include \"common.glsl\"\n\n// Epic approximation of schlicks\n// F0 is the specular reflectance at normal incidence.\n// via: http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf\nvec3 F_schlick( vec3 F0, float dotLH ) {\n\tfloat fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );\n\treturn ( 1.0 - F0 ) * fresnel + F0;\n}\n\n// normal distribution\n// alpha = roughness^2\n// via: http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf\nfloat D_ggx(const in float dotNH, const in float alpha) {\n    float alphaSquared = alpha * alpha;\n    float denominator = dotNH*dotNH * (alphaSquared - 1.0) + 1.0;\n    return (alphaSquared) / (PI * denominator*denominator);\n}\n\n// geometric attenuation\n// http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf\nfloat G_ggx(const in float dotNL, const in float dotNV, const in float roughness) {\n    float k = (roughness + 1.0);\n    k = k*k / 8.0;\n    float l = dotNL / ( dotNL * (1.0-k) + k);\n    float v = dotNV / ( dotNV * (1.0-k) + k);\n    return l * v;\n}\n\n// n = normal\n// l = light direction\n// v = view direction\n// F0 specular color\n// h = half angle between l and v\nvec3 brdf_ggx(vec3 n, vec3 l, vec3 v, vec3 F0, float roughness) {\n    float alpha = roughness * roughness;\n    vec3 h = normalize(l + v);\n\n    float dotNL = saturate(dot(n, l));\n    float dotNV = saturate(dot(n, v));\n    float dotNH = saturate(dot(n, h));\n    float dotLH = saturate(dot(l, h));\n\n    vec3 F = F_schlick(F0, dotLH);\n    float D = D_ggx(dotNH, alpha);\n    float G = G_ggx(dotNL, dotNV, roughness);\n\n    return F * ( G * D );\n}\n";

},{}],7:[function(require,module,exports){
module.exports = "#define saturate(x) clamp(x, 0.0, 1.0)\nconst float PI = 3.14159265359;\nconst float RECIPROCAL_PI = 1.0 / PI;\nconst float EPSILON = 1e-30;\n\nfloat gammaEncode(const in float linear){\n    return pow(linear, 1.0/2.2);\n}\nvec3 gammaEncode(const in vec3 linear) {\n    return pow(linear, vec3(1.0/2.2));\n}\nvec4 gammaEncode(const in vec4 linear) {\n    return vec4(pow(linear.rgb, vec3(1.0/2.2)), linear.a);\n}\n\nvec3 gammaDecode(const in vec3 linear) {\n    return pow(linear, vec3(2.2));\n}\n";

},{}],8:[function(require,module,exports){
module.exports = "// based on nvidia fxaa 3.11 console https://gist.github.com/bkaradzic/6011431\n// https://github.com/mitsuhiko/webgl-meincraft/blob/master/assets/shaders/fxaa.glsl\n// it has been modified with little testing and is quite possibly broken now.\n\n//   0.125 leaves less aliasing, but is softer (default!!!)\n//   0.25 leaves more aliasing, and is sharper\nconst float fxaaEdgeThreshold = 0.125;\n//   0.06 - faster but more aliasing in darks\n//   0.05 - default\n//   0.04 - slower and less aliasing in darks\nconst float fxaaConsoleEdgeThresholdMin = 0.00;\n\n//   8.0 is sharper (default!!!)\n//   4.0 is softer\n//   2.0 is really soft (good only for vector graphics inputs)\nconst float fxaaConsoleEdgeSharpness = 8.0;\n\n// for some reason fxaa wants gamma encoded values\n// so I gamma encode on the fly\nfloat fxaaLuma(vec4 color){\n    const vec4 luma = vec4(0.299, 0.587, 0.114, 0.0);\n    return gammaEncode(dot(saturate(color), luma));\n}\n\nvec4 fxaa(vec2 uv, const vec2 resolution, sampler2D sampler) {\n    //     N = 0.50 (default)\n    //     N = 0.33 (sharper)\n    vec4 fxaaConsoleRcpFrameOpt = vec4(0.33) / vec4(-resolution.x, -resolution.y, resolution.x, resolution.y);\n    vec4 fxaaConsoleRcpFrameOpt2 = vec4(2.0) / vec4(-resolution.x, -resolution.y, resolution.x, resolution.y);\n\n    // vec2 inverseVP = vec2(1.0 / uViewportSize.x, 1.0 / uViewportSize.y);\n    vec2 pixelOffset = vec2(1.0)/resolution;\n\n    vec4 rgbNw = texture2D(sampler, (uv + vec2(-1.0, -1.0)) * pixelOffset);\n    vec4 rgbNe = texture2D(sampler, (uv + vec2(1.0, -1.0)) * pixelOffset);\n    vec4 rgbSw = texture2D(sampler, (uv + vec2(-1.0, 1.0)) * pixelOffset);\n    vec4 rgbSe = texture2D(sampler, (uv + vec2(1.0, 1.0)) * pixelOffset);\n    vec4 rgbM  = texture2D(sampler, uv);\n\n    // ffxaa wants luma to be\n    float lumaNw = fxaaLuma(rgbNw);\n    float lumaNe = fxaaLuma(rgbNe);\n    float lumaSw = fxaaLuma(rgbSw);\n    float lumaSe = fxaaLuma(rgbSe);\n    float lumaM  = fxaaLuma(rgbM);\n\n    float lumaMaxNwSw = max(lumaNw, lumaSw);\n    lumaNe += 1.0/384.0;\n    float lumaMinNwSw = min(lumaNw, lumaSw);\n\n    float lumaMaxNeSe = max(lumaNe, lumaSe);\n    float lumaMinNeSe = min(lumaNe, lumaSe);\n\n    float lumaMax = max(lumaMaxNeSe, lumaMaxNwSw);\n    float lumaMin = min(lumaMinNeSe, lumaMinNwSw);\n\n    float lumaMaxScaled = lumaMax * fxaaEdgeThreshold;\n\n    float lumaMinM = min(lumaMin, lumaM);\n    float lumaMaxScaledClamped = max(fxaaConsoleEdgeThresholdMin, lumaMaxScaled);\n    float lumaMaxM = max(lumaMax, lumaM);\n    float dirSwMinusNe = lumaSw - lumaNe;\n    float lumaMaxSubMinM = lumaMaxM - lumaMinM;\n    float dirSeMinusNw = lumaSe - lumaNw;\n    // early out\n    // if(lumaMaxSubMinM < lumaMaxScaledClamped) return vec4(1.0, 0.0, 0.0, 1.0);\n    if(lumaMaxSubMinM < lumaMaxScaledClamped) return rgbM;\n\n    vec2 dir = dirSwMinusNe + vec2(dirSeMinusNw, -dirSeMinusNw);\n\n    vec2 dir1 = normalize(dir.xy);\n    // this is suboptimal. It would probably be more efficient to do this in another stage.\n    vec4 rgbyN1 = gammaEncode(saturate(texture2D(sampler, uv - dir1 * fxaaConsoleRcpFrameOpt.zw)));\n    vec4 rgbyP1 = gammaEncode(saturate(texture2D(sampler, uv + dir1 * fxaaConsoleRcpFrameOpt.zw)));\n\n    float dirAbsMinTimesC = min(abs(dir1.x), abs(dir1.y)) * fxaaConsoleEdgeSharpness;\n    vec2 dir2 = clamp(dir1.xy / dirAbsMinTimesC, -2.0, 2.0);\n\n    vec4 rgbyN2 = gammaEncode(saturate(texture2D(sampler, uv - dir2 * fxaaConsoleRcpFrameOpt2.zw)));\n    vec4 rgbyP2 = gammaEncode(saturate(texture2D(sampler, uv + dir2 * fxaaConsoleRcpFrameOpt2.zw)));\n\n    vec4 rgbyA = rgbyN1 + rgbyP1;\n    vec4 rgbyB = ((rgbyN2 + rgbyP2) * 0.25) + (rgbyA * 0.25);\n\n    bool twoTap = (rgbyB.y < lumaMin) || (rgbyB.y > lumaMax);\n\n    if(twoTap) rgbyB.xyz = rgbyA.xyz * 0.5;\n\n    return rgbyB;\n}\n";

},{}],9:[function(require,module,exports){
module.exports = "precision highp float;\n#include \"common.glsl\"\n#include \"brdf.glsl\"\n\nuniform sampler2D uNormalSampler;\n\n#ifdef USE_BASE_COLOR_MAP\nuniform sampler2D uBaseColorSampler;\n#endif\n\n#ifdef USE_MATERIAL_MAP\nuniform sampler2D uMaterialSampler;\n#endif\n\nuniform vec3 uBaseColor;\nuniform float uMetalness;\nuniform float uRoughness;\n\n#ifdef IS_POINT_LIGHT\nuniform vec3 uLightPosition;\n#endif\n\n#ifdef USE_SSS\nuniform float uSubSurfaceScattering;\n#endif\n\n#ifdef IS_DIRECTIONAL_LIGHT\nuniform vec3 uLightDirection;\n#endif\n\nuniform vec3 uLightColor;\nuniform float uViewportAspect;\nuniform float uScale;\n\nvarying vec2 vUv;\nvarying vec3 vPosition;\n\n#ifdef USE_SINGLE_PASS\n#include \"ambient.glsl\"\n#endif\n\nconst vec3 eye = vec3(0.5, 0.5, 100.0);\n\nfloat attenuation(float distance){\n    return  1.0/(distance*distance);\n}\n\nvec3 rgbToNormal(vec3 rgb){\n    return normalize(rgb - vec3(0.5));\n}\n\nvoid main(){\n    vec4 normalSample = texture2D(uNormalSampler, vUv);\n    float alpha = normalSample.a;\n    vec3 normal = rgbToNormal(normalSample.rgb);\n#ifdef USE_SSS\n    vec4 diffuseNormalSample = texture2D(uNormalSampler, vUv, uSubSurfaceScattering);\n    vec3 diffuseNormal = rgbToNormal(diffuseNormalSample.rgb);\n#else\n#define diffuseNormal normal\n#endif\n\n    float metalness = uMetalness;\n    float roughness = uRoughness;\n\n#ifdef USE_MATERIAL_MAP\n    vec4 materialSample = texture2D(uMaterialSampler, vUv);\n    metalness *= materialSample.r;\n    roughness *= materialSample.g;\n    float occlusion = materialSample.b;\n#endif\n\n    metalness = saturate(metalness);\n    roughness = clamp(roughness, EPSILON, 1.0);\n\n    vec3 baseColor = uBaseColor;\n\n#ifdef USE_BASE_COLOR_MAP\n    vec4 baseColorSample = texture2D(uBaseColorSampler, vUv);\n    baseColor *= gammaDecode(baseColorSample.rgb);\n#endif\n\n    vec3 diffuseColor = mix(baseColor, vec3(0.0), metalness);\n    // ?\n    vec3 specularColor = mix(vec3(0.04), baseColor.rgb, metalness)*0.5;\n\n#ifdef IS_POINT_LIGHT\n    vec3 lightOffset = vPosition - uLightPosition;\n    lightOffset.y /= uViewportAspect;\n    float lightDistance = length(lightOffset);\n    float falloff = attenuation(lightDistance);\n    vec3 lightDirection = lightOffset/lightDistance;\n#endif\n\n#ifdef IS_DIRECTIONAL_LIGHT\n    float falloff = 1.0;\n    vec3 lightDirection = uLightDirection;\n#endif\n\n    vec3 eyeDirection = normalize(eye - vPosition);\n    vec3 diffuse = max(0.0, -dot(diffuseNormal, lightDirection))*diffuseColor;\n    // linear = vec3(roughness);\n    vec3 specular = brdf_ggx(normal, -lightDirection, eyeDirection, specularColor, roughness);\n    vec3 intensity = (diffuse+specular)*falloff;\n\n#ifdef USE_MATERIAL_MAP\n    intensity *= occlusion;\n#endif\n\n    vec3 linear = uLightColor*intensity;\n    // linear = specularColor;\n    // linear.r = metalness;\n    // linear = vec3(uRoughness*materialSample.g == materialSample.g ? 1.0 : 0.0);\n    // linear.b = occlusion;\n\n    gl_FragColor = vec4(linear, alpha);\n\n#ifdef USE_SINGLE_PASS\n    gl_FragColor = gammaEncode(gl_FragColor);\n#ifdef USE_AMBIENT_MAP\n   addAmbient(gl_FragColor);\n#endif\n#endif\n\n}\n";

},{}],10:[function(require,module,exports){
module.exports = "precision highp float;\n#include \"common.glsl\"\n#include \"fxaa.glsl\"\n\nuniform sampler2D uFrameBufferSampler;\nuniform vec2 uFrameBufferResolution;\n\nvarying vec3 vPosition;\n\n#ifdef USE_AMBIENT_MAP\nvarying vec2 vUv;\n#endif\n\n#include \"ambient.glsl\"\n\nvoid main(){\n#ifdef USE_FXAA\n    // fxaa does gammaEncode .. for now\n    vec4 frameBuffer = fxaa(vec2(vPosition.x, 1.0 - vPosition.y), uFrameBufferResolution, uFrameBufferSampler);\n#endif\n#ifndef USE_FXAA\n    vec4 frameBuffer = gammaEncode(texture2D(uFrameBufferSampler, vec2(vPosition.x, 1.0 - vPosition.y)));\n#endif\n    gl_FragColor = frameBuffer;\n// assume SRGB\n#ifdef USE_AMBIENT_MAP\n   addAmbient(gl_FragColor);\n#endif\n}\n";

},{}],11:[function(require,module,exports){
module.exports = "attribute vec3 aPosition;\n#ifdef USE_AMBIENT_MAP\nvarying vec2 vUv;\n#endif\n\nvoid main(){\n    vUv = vec2(0.5)-(aPosition.xy)*vec2(-0.5, 0.5);\n    gl_Position = vec4(aPosition, 1.0);\n}\n";

},{}],12:[function(require,module,exports){
module.exports = "attribute vec3 aPosition;\n\nuniform float uScale;\nuniform float uTextureAspect;\n\nvarying vec2 vUv;\nvarying vec3 vPosition;\n\nvoid main(){\n    vPosition = vec3(vec2(0.5)-(aPosition.xy)*vec2(-0.5, 0.5), 0);\n    vUv = vPosition.xy * uScale * vec2(1.0, 1.0/uTextureAspect);\n    gl_Position = vec4(aPosition, 1.0);\n}\n";

},{}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZmJvLmpzIiwic3JjL25vcm1hbG1hcC5qcyIsInNyYy9zaGFkZXItbWFuYWdlci5qcyIsInNyYy9zaGFkZXIuanMiLCJzcmMvc2hhZGVycy9hbWJpZW50Lmdsc2wiLCJzcmMvc2hhZGVycy9icmRmLmdsc2wiLCJzcmMvc2hhZGVycy9jb21tb24uZ2xzbCIsInNyYy9zaGFkZXJzL2Z4YWEuZ2xzbCIsInNyYy9zaGFkZXJzL2xpZ2h0LWZyYWdtZW50Lmdsc2wiLCJzcmMvc2hhZGVycy9yZW5kZXItZnJhZ21lbnQuZ2xzbCIsInNyYy9zaGFkZXJzL3JlbmRlci12ZXJ0ZXguZ2xzbCIsInNyYy9zaGFkZXJzL3ZlcnRleC5nbHNsIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbExBO0FBQ0E7O0FDREE7QUFDQTs7QUNEQTtBQUNBOztBQ0RBO0FBQ0E7O0FDREE7QUFDQTs7QUNEQTtBQUNBOztBQ0RBO0FBQ0E7O0FDREE7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJmdW5jdGlvbiBGQk8oZ2wsIHdpZHRoLCBoZWlnaHQsIHR5cGUsIGZvcm1hdCwgZGVwdGgpe1xuICAgIHdpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoO1xuICAgIGhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0O1xuICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB0aGlzLmdsID0gZ2w7XG5cbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIHRoaXMuZnJhbWVidWZmZXIpO1xuXG4gICAgdGhpcy50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpO1xuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRoaXMudGV4dHVyZSk7XG4gICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCBmb3JtYXQgfHwgZ2wuUkdCQSwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0IHx8IGdsLlJHQkEsIHR5cGUgfHwgZ2wuVU5TSUdORURfQllURSwgbnVsbCk7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01BR19GSUxURVIsIGdsLkxJTkVBUik7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUik7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfUywgZ2wuQ0xBTVBfVE9fRURHRSk7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSk7XG5cbiAgICBpZihkZXB0aCl7XG4gICAgICAgIHRoaXMuZGVwdGggPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKTtcbiAgICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihnbC5SRU5ERVJCVUZGRVIsIHRoaXMuZGVwdGgpO1xuICAgICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKGdsLlJFTkRFUkJVRkZFUiwgZ2wuREVQVEhfQ09NUE9ORU5UMTYsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZ2wuREVQVEhfQVRUQUNITUVOVCwgZ2wuUkVOREVSQlVGRkVSLCB0aGlzLmRlcHRoKTtcbiAgICB9XG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGdsLkNPTE9SX0FUVEFDSE1FTlQwLCBnbC5URVhUVVJFXzJELCB0aGlzLnRleHR1cmUsIDApO1xuXG4gICAgdGhpcy5zdXBwb3J0ZWQgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKGdsLkZSQU1FQlVGRkVSKSA9PT0gZ2wuRlJBTUVCVUZGRVJfQ09NUExFVEU7XG5cbiAgICBnbC52aWV3cG9ydCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBudWxsKTtcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKGdsLlJFTkRFUkJVRkZFUiwgbnVsbCk7XG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBudWxsKTtcbn1cbkZCTy5wcm90b3R5cGUgPSB7XG4gICAgYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmdsLmJpbmRGcmFtZWJ1ZmZlcih0aGlzLmdsLkZSQU1FQlVGRkVSLCB0aGlzLmZyYW1lYnVmZmVyKTtcbiAgICB9LFxuICAgIHVuYmluZDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuZ2wuYmluZEZyYW1lYnVmZmVyKHRoaXMuZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xuICAgIH1cbn07XG5tb2R1bGUuZXhwb3J0cyA9IEZCTztcbiIsIlxudmFyIHNoYWRlclNvdXJjZXMgPSAoe1wic2hhZGVyc1wiOih7XCJhbWJpZW50XCI6cmVxdWlyZShcIi4vc2hhZGVycy9hbWJpZW50Lmdsc2xcIiksXCJicmRmXCI6cmVxdWlyZShcIi4vc2hhZGVycy9icmRmLmdsc2xcIiksXCJjb21tb25cIjpyZXF1aXJlKFwiLi9zaGFkZXJzL2NvbW1vbi5nbHNsXCIpLFwiZnhhYVwiOnJlcXVpcmUoXCIuL3NoYWRlcnMvZnhhYS5nbHNsXCIpLFwibGlnaHQtZnJhZ21lbnRcIjpyZXF1aXJlKFwiLi9zaGFkZXJzL2xpZ2h0LWZyYWdtZW50Lmdsc2xcIiksXCJyZW5kZXItZnJhZ21lbnRcIjpyZXF1aXJlKFwiLi9zaGFkZXJzL3JlbmRlci1mcmFnbWVudC5nbHNsXCIpLFwicmVuZGVyLXZlcnRleFwiOnJlcXVpcmUoXCIuL3NoYWRlcnMvcmVuZGVyLXZlcnRleC5nbHNsXCIpLFwidmVydGV4XCI6cmVxdWlyZShcIi4vc2hhZGVycy92ZXJ0ZXguZ2xzbFwiKX0pfSkuc2hhZGVycztcbnZhciBTaGFkZXJNYW5hZ2VyID0gcmVxdWlyZSgnLi9zaGFkZXItbWFuYWdlcicpO1xudmFyIEZCTyA9IHJlcXVpcmUoJy4vZmJvJyk7XG5cbmNvbnN0IE5PUk1BTF9TQU1QTEVSID0gMDtcbmNvbnN0IEJBU0VfQ09MT1JfU0FNUExFUiA9IDE7XG5jb25zdCBNQVRFUklBTF9TQU1QTEVSID0gMjtcbmNvbnN0IEFNQklFTlRfU0FNUExFUiA9IDM7XG5jb25zdCBGUkFNRUJVRkZFUl9TQU1QTEVSID0gNDtcblxudmFyIElNTVVUQUJMRV9QUk9QRVJUSUVTID0gJ2NhbnZhcyByZXBlYXQgc2luZ2xlUGFzcycuc3BsaXQoKTtcblxuZnVuY3Rpb24gbm9ybWFsbWFwKG9wdGlvbnMpe1xuICAgIG9wdGlvbnMgPSBhc3NpZ24oe1xuICAgICAgICBtZXRhbG5lc3M6IDEsXG4gICAgICAgIHJvdWdobmVzczogMSxcbiAgICAgICAgYW1iaWVudDogMSxcbiAgICAgICAgYmFzZUNvbG9yOiBuZXcgRmxvYXQzMkFycmF5KFswLjUsIDAuNSwgMC41XSlcbiAgICB9LCBvcHRpb25zKTtcbiAgICB2YXIgY2FudmFzID0gb3B0aW9ucy5jYW52YXM7XG5cbiAgICBpZihjYW52YXMgPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKCdub3JtYWxtYXAoKSBjYW52YXMgaXMgcmVxdWlyZWQnKTtcblxuICAgIGlmKG9wdGlvbnMubm9ybWFsTWFwID09IG51bGwpIHRocm93IG5ldyBFcnJvcignbm9ybWFsbWFwKCkgbm9ybWFsTWFwIGlzIHJlcXVpcmVkJyk7XG5cbiAgICB2YXIgZGVmaW5lcyA9IHt9O1xuICAgIGRlZmluZURlZmluZXMoZGVmaW5lcywgb3B0aW9ucyk7XG4gICAgaWYob3B0aW9ucy5kZWJ1ZykgeyBjb25zb2xlLmxvZygnZGVmaW5lcycsIGRlZmluZXMpOyB9XG5cbiAgICB2YXIgbm9ybWFsTWFwV2lkdGggPSBvcHRpb25zLm5vcm1hbE1hcC5uYXR1cmFsV2lkdGggfHwgb3B0aW9ucy5ub3JtYWxNYXAud2lkdGg7XG4gICAgdmFyIG5vcm1hbE1hcEhlaWdodCA9IG9wdGlvbnMubm9ybWFsTWFwLm5hdHVyYWxIZWlnaHQgfHwgb3B0aW9ucy5ub3JtYWxNYXAuaGVpZ2h0O1xuXG4gICAgdmFyIHRleHR1cmVBc3BlY3QgPSBub3JtYWxNYXBXaWR0aCAvIG5vcm1hbE1hcEhlaWdodDtcbiAgICB2YXIgdmlld3BvcnRBc3BlY3QsIHNjYWxlO1xuXG4gICAgZnVuY3Rpb24gcmVzaXplKCl7XG4gICAgICAgIHZpZXdwb3J0QXNwZWN0ID0gY2FudmFzLndpZHRoIC8gY2FudmFzLmhlaWdodDtcbiAgICAgICAgc2NhbGUgPSBvcHRpb25zLnJlcGVhdCA/IChjYW52YXMud2lkdGggLyBub3JtYWxNYXBXaWR0aCkgOiAxO1xuICAgICAgICBpZihnbCkge1xuICAgICAgICAgICAgaWYoKCFvcHRpb25zLnNpbmdsZVBhc3MpKXtcbiAgICAgICAgICAgICAgICBmYm8udW5iaW5kKCk7XG4gICAgICAgICAgICAgICAgZmJvID0gZ2V0RkJPKGdsKTtcbiAgICAgICAgICAgICAgICBmYm8uYmluZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ2wudmlld3BvcnQoMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlc2l6ZSgpO1xuXG4gICAgLy8gdGhlc2UgbmVlZCB0byBiZSByZXNldCBvbiBnbCByZWluaXRpYWxpemF0aW9uc1xuICAgIHZhciBzaGFkZXJNYW5hZ2VyO1xuICAgIHZhciBwb2ludExpZ2h0U2hhZGVyLCBkaXJlY3Rpb25hbExpZ2h0U2hhZGVyLCByZW5kZXJTaGFkZXI7XG4gICAgdmFyIHNjcmVlblF1YWQsIGZibztcbiAgICB2YXIgZ2w7XG5cbiAgICBmdW5jdGlvbiBpbml0R2woKXtcbiAgICAgICAgdmFyIGdsT3B0aW9ucyA9IHtcbiAgICAgICAgICAgIC8vIGZhbHNlIGlzIG5vdCBzdXBwb3J0ZWQgYnkgaU9TXG4gICAgICAgICAgICBwcmVtdWx0aXBsaWVkQWxwaGE6IHRydWUsXG4gICAgICAgICAgICBhbHBoYTogdHJ1ZSxcbiAgICAgICAgICAgIGRlcHRoOiBmYWxzZVxuICAgICAgICB9O1xuXG4gICAgICAgIGdsID0gY2FudmFzLmdldENvbnRleHQoJ3dlYmdsJywgZ2xPcHRpb25zKSB8fCBjYW52YXMuZ2V0Q29udGV4dCgnZXhwZXJpbWVudGFsLXdlYmdsJywgZ2xPcHRpb25zKTtcblxuICAgICAgICBpZighZ2wpe1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCd3ZWJnbCBub3Qgc3VwcG9ydGVkIScpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2wuYmxlbmRDb2xvcigwLCAwLCAwLCAwKTtcbiAgICAgICAgZ2wuY2xlYXJDb2xvcigwLCAwLCAwLCAwKTtcbiAgICAgICAgc2NyZWVuUXVhZCA9IGdldFNjcmVlblF1YWRCdWZmZXIoZ2wpO1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgwKTtcbiAgICAgICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHNjcmVlblF1YWQpO1xuICAgICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKDAsIDMsIGdsLkZMT0FULCBmYWxzZSwgMCwgMCk7XG5cbiAgICAgICAgZ2wuZW5hYmxlKGdsLkJMRU5EKTtcbiAgICAgICAgZ2wuZW5hYmxlKGdsLkRJVEhFUik7XG4gICAgICAgIGdsLmRpc2FibGUoZ2wuREVQVEhfVEVTVCk7XG5cbiAgICAgICAgZ2wuYmxlbmRGdW5jU2VwYXJhdGUoZ2wuU1JDX0FMUEhBLCBnbC5PTkUsIGdsLk9ORSwgZ2wuWkVSTyk7XG5cbiAgICAgICAgc2hhZGVyTWFuYWdlciA9IG5ldyBTaGFkZXJNYW5hZ2VyKGdsLCBzaGFkZXJTb3VyY2VzKTtcbiAgICAgICAgaWYoIW9wdGlvbnMuc2luZ2xlUGFzcyl7XG4gICAgICAgICAgICBmYm9UeXBlID0gbnVsbDtcbiAgICAgICAgICAgIGZibyA9IGdldEZCTyhnbCk7XG4gICAgICAgICAgICBmYm8uYmluZCgpO1xuICAgICAgICB9XG4gICAgICAgIGdsLnZpZXdwb3J0KDAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCk7XG5cbiAgICAgICAgY29uZmlndXJlR2woKTtcbiAgICAgICAgd2luZG93LmdsID0gZ2w7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29uZmlndXJlR2woKXtcbiAgICAgICAgc2V0dXBUZXh0dXJlcyhnbCwgb3B0aW9ucyk7XG4gICAgICAgIGJ1aWxkU2hhZGVycygpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkU2hhZGVyKG5hbWUsIGFkZGl0aW9uYWxEZWZpbmVzKXtcbiAgICAgICAgcmV0dXJuIHNoYWRlck1hbmFnZXIuZ2V0KCd2ZXJ0ZXgnLCBuYW1lICsgJy1mcmFnbWVudCcsXG4gICAgICAgICAgICBhc3NpZ24oYWRkaXRpb25hbERlZmluZXN8fHt9LCBkZWZpbmVzKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRTaGFkZXJzKCl7XG4gICAgICAgIGRlZmluZURlZmluZXMoZGVmaW5lcywgb3B0aW9ucyk7XG4gICAgICAgIHBvaW50TGlnaHRTaGFkZXIgPSBidWlsZFNoYWRlcignbGlnaHQnLCB7SVNfUE9JTlRfTElHSFQ6IDF9KTtcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodFNoYWRlciA9IGJ1aWxkU2hhZGVyKCdsaWdodCcsIHtJU19ESVJFQ1RJT05BTF9MSUdIVDogMX0pO1xuICAgICAgICByZW5kZXJTaGFkZXIgPSBidWlsZFNoYWRlcigncmVuZGVyJyk7XG4gICAgfVxuXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJnbGNvbnRleHRsb3N0XCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgZ2wgPSBudWxsO1xuICAgICAgICBjb25zb2xlLndhcm4oJ2xvc3Qgd2ViZ2wgY29udGV4dCEnKTtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH0sIGZhbHNlKTtcblxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0cmVzdG9yZWRcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgY29uc29sZS53YXJuKCd3ZWJnbCBjb250ZXh0IHJlc3RvcmVkIScpO1xuICAgICAgICBpbml0R2woKTtcbiAgICAgICAgaWYob3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCkge1xuICAgICAgICAgICAgb3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCgpO1xuICAgICAgICB9XG5cbiAgICB9LCBmYWxzZSk7XG5cbiAgICBpbml0R2woKTtcblxuICAgIGZ1bmN0aW9uIGdldEdlbmVyaWNVbmlmb3Jtcygpe1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdVRleHR1cmVBc3BlY3Q6IG9wdGlvbnMucmVwZWF0ID8gdmlld3BvcnRBc3BlY3QqdGV4dHVyZUFzcGVjdCA6IDEsXG4gICAgICAgICAgICB1U2NhbGU6IHNjYWxlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0R2VuZXJpY0xpZ2h0VW5pZm9ybXMoY29sb3Ipe1xuICAgICAgICB2YXIgdW5pZm9ybXMgPSBhc3NpZ24oZ2V0R2VuZXJpY1VuaWZvcm1zKCksIHtcbiAgICAgICAgICAgIHVMaWdodENvbG9yOiBjb2xvcixcbiAgICAgICAgICAgIHVNZXRhbG5lc3M6IG9wdGlvbnMubWV0YWxuZXNzLFxuICAgICAgICAgICAgdVJvdWdobmVzczogb3B0aW9ucy5yb3VnaG5lc3MsXG4gICAgICAgICAgICB1QmFzZUNvbG9yOiBvcHRpb25zLmJhc2VDb2xvcixcbiAgICAgICAgICAgIHVOb3JtYWxTYW1wbGVyOiBOT1JNQUxfU0FNUExFUlxuICAgICAgICB9KTtcbiAgICAgICAgaWYob3B0aW9ucy5iYXNlQ29sb3JNYXApIHtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVCYXNlQ29sb3JTYW1wbGVyID0gQkFTRV9DT0xPUl9TQU1QTEVSO1xuICAgICAgICB9XG4gICAgICAgIGlmKG9wdGlvbnMubWF0ZXJpYWxNYXApIHtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVNYXRlcmlhbFNhbXBsZXIgPSBNQVRFUklBTF9TQU1QTEVSO1xuICAgICAgICB9XG4gICAgICAgIGlmKG9wdGlvbnMuc3ViU3VyZmFjZVNjYXR0ZXJpbmcpe1xuICAgICAgICAgICAgdW5pZm9ybXMudVN1YlN1cmZhY2VTY2F0dGVyaW5nID0gb3B0aW9ucy5zdWJTdXJmYWNlU2NhdHRlcmluZztcbiAgICAgICAgfVxuICAgICAgICBpZihvcHRpb25zLnNpbmdsZVBhc3MgJiYgb3B0aW9ucy5hbWJpZW50TWFwKXtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVBbWJpZW50U2FtcGxlciA9IEFNQklFTlRfU0FNUExFUjtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVBbWJpZW50ID0gb3B0aW9ucy5hbWJpZW50O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmlmb3JtcztcbiAgICB9XG5cbiAgICB2YXIgZmJvVHlwZSA9IG51bGw7XG4gICAgdmFyIGZib0Zvcm1hdDtcbiAgICBmdW5jdGlvbiBnZXRGQk8oZ2wpe1xuICAgICAgICB2YXIgZmJvO1xuICAgICAgICBpZihmYm9UeXBlKSByZXR1cm4gbmV3IEZCTyhnbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZib1R5cGUsIGZib0Zvcm1hdCk7XG4gICAgICAgIHZhciBoYWxmRmxvYXQgPSBnbC5nZXRFeHRlbnNpb24oJ09FU190ZXh0dXJlX2hhbGZfZmxvYXQnKTtcbiAgICAgICAgdmFyIGhhbGZGbG9hdExpbmVhciA9IGdsLmdldEV4dGVuc2lvbignT0VTX3RleHR1cmVfaGFsZl9mbG9hdF9saW5lYXInKTtcbiAgICAgICAgaWYoaGFsZkZsb2F0ICYmIGhhbGZGbG9hdExpbmVhciAmJiB0cnVlKXtcbiAgICAgICAgICAgIGZibyA9IG5ldyBGQk8oZ2wsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBoYWxmRmxvYXQuSEFMRl9GTE9BVF9PRVMpO1xuICAgICAgICAgICAgaWYoZmJvLnN1cHBvcnRlZCl7XG4gICAgICAgICAgICAgICAgZmJvVHlwZSA9IGhhbGZGbG9hdC5IQUxGX0ZMT0FUX09FUztcbiAgICAgICAgICAgICAgICByZXR1cm4gZmJvO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHZhciBmbG9hdCA9IGdsLmdldEV4dGVuc2lvbignT0VTX3RleHR1cmVfZmxvYXQnKTtcbiAgICAgICAgdmFyIGZsb2F0TGluZWFyID0gZ2wuZ2V0RXh0ZW5zaW9uKCdPRVNfdGV4dHVyZV9mbG9hdF9saW5lYXInKTtcbiAgICAgICAgaWYoZmxvYXQgJiYgZmxvYXRMaW5lYXIgJiYgZmFsc2Upe1xuICAgICAgICAgICAgZmJvID0gbmV3IEZCTyhnbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGdsLkZMT0FUKTtcbiAgICAgICAgICAgIGlmKGZiby5zdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICBmYm9UeXBlID0gZ2wuRkxPQVQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZibztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmYm9UeXBlID0gZ2wuVU5TSUdORURfQllURTtcbiAgICAgICAgdmFyIGV4dFNSR0IgPSBnbC5nZXRFeHRlbnNpb24oJ0VYVF9zUkdCJyk7XG4gICAgICAgIGlmKGV4dFNSR0Ipe1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ3NSR0IgcHJlc2VudCcpO1xuICAgICAgICAgICAgZmJvID0gbmV3IEZCTyhnbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGdsLlVOU0lHTkVEX0JZVEUsIGV4dFNSR0IuU1JHQl9BTFBIQV9FWFQpO1xuICAgICAgICAgICAgaWYoZmJvLnN1cHBvcnRlZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdzUkdCIHN1cHBvcnRlZCcpO1xuICAgICAgICAgICAgICAgIGZib0Zvcm1hdCA9IGV4dFNSR0IuU1JHQl9BTFBIQV9FWFQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdzUkdCIEZCTyBub3Qgc3VwcG9ydGVkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBGQk8oZ2wpO1xuICAgIH1cblxuICAgIHZhciBsaWdodHMgPSB7XG4gICAgICAgIGNhbnZhczogY2FudmFzLFxuICAgICAgICBhZGRQb2ludExpZ2h0OiBmdW5jdGlvbihwb3NpdGlvbiwgY29sb3Ipe1xuICAgICAgICAgICAgaWYoIWdsKSByZXR1cm47XG4gICAgICAgICAgICBpZihvcHRpb25zLnNpbmdsZVBhc3Mpe1xuICAgICAgICAgICAgICAgIGdsLmNsZWFyKGdsLkNPTE9SX0JVRkZFUl9CSVQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcG9pbnRMaWdodFNoYWRlci51c2UoKTtcbiAgICAgICAgICAgIHZhciB1bmlmb3JtcyA9IGdldEdlbmVyaWNMaWdodFVuaWZvcm1zKGNvbG9yKTtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVMaWdodFBvc2l0aW9uID0gcG9zaXRpb247XG4gICAgICAgICAgICB1bmlmb3Jtcy51Vmlld3BvcnRBc3BlY3QgPSB2aWV3cG9ydEFzcGVjdDtcbiAgICAgICAgICAgIHBvaW50TGlnaHRTaGFkZXIudW5pZm9ybXModW5pZm9ybXMpO1xuICAgICAgICAgICAgZHJhd0J1ZmZlcihnbCk7XG4gICAgICAgIH0sXG4gICAgICAgIGFkZERpcmVjdGlvbmFsTGlnaHQ6IGZ1bmN0aW9uKGRpcmVjdGlvbiwgY29sb3Ipe1xuICAgICAgICAgICAgaWYoIWdsKSByZXR1cm47XG4gICAgICAgICAgICBpZihvcHRpb25zLnNpbmdsZVBhc3Mpe1xuICAgICAgICAgICAgICAgIGdsLmNsZWFyKGdsLkNPTE9SX0JVRkZFUl9CSVQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGlyZWN0aW9uYWxMaWdodFNoYWRlci51c2UoKTtcbiAgICAgICAgICAgIHZhciB1bmlmb3JtcyA9IGdldEdlbmVyaWNMaWdodFVuaWZvcm1zKGNvbG9yKTtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVMaWdodERpcmVjdGlvbiA9IGRpcmVjdGlvbjtcbiAgICAgICAgICAgIGRpcmVjdGlvbmFsTGlnaHRTaGFkZXIudW5pZm9ybXModW5pZm9ybXMpO1xuICAgICAgICAgICAgZHJhd0J1ZmZlcihnbCk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCFnbCkgcmV0dXJuO1xuICAgICAgICAgICAgaWYob3B0aW9ucy5zaW5nbGVQYXNzKSByZXR1cm47XG4gICAgICAgICAgICBmYm8udW5iaW5kKCk7XG4gICAgICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwICsgRlJBTUVCVUZGRVJfU0FNUExFUik7XG4gICAgICAgICAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBmYm8udGV4dHVyZSk7XG5cbiAgICAgICAgICAgIHJlbmRlclNoYWRlci51c2UoKTtcbiAgICAgICAgICAgIHZhciB1bmlmb3JtcyA9IHtcbiAgICAgICAgICAgICAgICB1RnJhbWVCdWZmZXJTYW1wbGVyOiBGUkFNRUJVRkZFUl9TQU1QTEVSXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZihvcHRpb25zLmFudGlBbGlhc2luZykge1xuICAgICAgICAgICAgICAgIHVuaWZvcm1zLnVGcmFtZUJ1ZmZlclJlc29sdXRpb24gPSBuZXcgRmxvYXQzMkFycmF5KFtmYm8ud2lkdGgsIGZiby5oZWlnaHRdKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYob3B0aW9ucy5hbWJpZW50TWFwKXtcbiAgICAgICAgICAgICAgICBhc3NpZ24odW5pZm9ybXMsIGdldEdlbmVyaWNVbmlmb3JtcygpKTtcbiAgICAgICAgICAgICAgICB1bmlmb3Jtcy51QW1iaWVudFNhbXBsZXIgPSBBTUJJRU5UX1NBTVBMRVI7XG4gICAgICAgICAgICAgICAgdW5pZm9ybXMudUFtYmllbnQgPSBvcHRpb25zLmFtYmllbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlbmRlclNoYWRlci51bmlmb3Jtcyh1bmlmb3Jtcyk7XG4gICAgICAgICAgICBnbC5jbGVhcihnbC5DT0xPUl9CVUZGRVJfQklUKTtcbiAgICAgICAgICAgIGRyYXdCdWZmZXIoZ2wpO1xuICAgICAgICAgICAgZmJvLmJpbmQoKTtcbiAgICAgICAgICAgIGdsLmNsZWFyKGdsLkNPTE9SX0JVRkZFUl9CSVQpO1xuICAgICAgICB9LFxuICAgICAgICBjb25maWd1cmU6IGZ1bmN0aW9uKGNoYW5nZXMpe1xuICAgICAgICAgICAgSU1NVVRBQkxFX1BST1BFUlRJRVMuZm9yRWFjaChmdW5jdGlvbihwcm9wKXtcbiAgICAgICAgICAgICAgICBpZihwcm9wIGluIGNoYW5nZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcImNhbid0IGNvbmZpZ3VyZSgpXCIgKyBwcm9wKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGFzc2lnbihvcHRpb25zLCBjaGFuZ2VzKTtcbiAgICAgICAgICAgIGlmKGdsKSBjb25maWd1cmVHbCgpO1xuICAgICAgICB9LFxuICAgICAgICByZXNpemU6IHJlc2l6ZVxuICAgIH07XG5cbiAgICByZXR1cm4gbGlnaHRzO1xufVxubW9kdWxlLmV4cG9ydHMgPSBub3JtYWxtYXA7XG5cbmZ1bmN0aW9uIGRlZmluZURlZmluZXMoZGVmaW5lcywgb3B0aW9ucyl7XG4gICAgZGVmaW5lcy5VU0VfQkFTRV9DT0xPUl9NQVAgPSBvcHRpb25zLmJhc2VDb2xvck1hcCAmJiAxO1xuICAgIGRlZmluZXMuVVNFX01BVEVSSUFMX01BUCA9IG9wdGlvbnMubWF0ZXJpYWxNYXAgJiYgMTtcbiAgICBkZWZpbmVzLlVTRV9BTUJJRU5UX01BUCA9IG9wdGlvbnMuYW1iaWVudE1hcCAmJiAxO1xuICAgIGRlZmluZXMuVVNFX1NTUyA9IG9wdGlvbnMuc3ViU3VyZmFjZVNjYXR0ZXJpbmcgJiYgMTtcbiAgICBkZWZpbmVzLlVTRV9GWEFBID0gb3B0aW9ucy5hbnRpQWxpYXNpbmcgPyAxIDogdW5kZWZpbmVkO1xuICAgIGRlZmluZXMuVVNFX1NJTkdMRV9QQVNTID0gb3B0aW9ucy5zaW5nbGVQYXNzID8gMSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0U2NyZWVuUXVhZEJ1ZmZlcihnbCl7XG4gICAgdmFyIGJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xuICAgIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBidWZmZXIpO1xuICAgIHZhciB2ZXJ0aWNlcyA9IG5ldyBGbG9hdDMyQXJyYXkoW1xuICAgICAgICAxLjAsICAxLjAsICAwLjAsXG4gICAgICAgIC0xLjAsIDEuMCwgIDAuMCxcbiAgICAgICAgMS4wLCAgLTEuMCwgMC4wLFxuICAgICAgICAtMS4wLCAtMS4wLCAwLjBcbiAgICBdKTtcbiAgICBnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgdmVydGljZXMsIGdsLlNUQVRJQ19EUkFXKTtcbiAgICByZXR1cm4gYnVmZmVyO1xufVxuXG5mdW5jdGlvbiBpbWFnZVRvVGV4dHVyZShnbCwgaW1hZ2UsIHR5cGUsIHJlcGVhdCl7XG4gICAgdmFyIHRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XG4gICAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgdGV4dHVyZSk7XG5cbiAgICBnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfRkxJUF9ZX1dFQkdMLCBmYWxzZSk7XG4gICAgZ2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCBmYWxzZSk7XG4gICAgZ2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgZ2wuTk9ORSk7XG5cbiAgICB2YXIgaXNQb3QgPSBpc0ltYWdlUG93ZXJPZlR3byhpbWFnZSk7XG4gICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCB0eXBlIHx8IGdsLlJHQkEsIHR5cGUgfHwgZ2wuUkdCQSwgZ2wuVU5TSUdORURfQllURSwgaW1hZ2UpO1xuICAgIGlmKGlzUG90KXtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01BR19GSUxURVIsIGdsLkxJTkVBUik7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NSU5fRklMVEVSLCBnbC5MSU5FQVJfTUlQTUFQX0xJTkVBUik7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgZ2wuTElORUFSKTtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUik7XG4gICAgfVxuICAgIGlmKHJlcGVhdCAmJiBpc1BvdCl7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1MsIGdsLlJFUEVBVCk7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1QsIGdsLlJFUEVBVCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKTtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSk7XG4gICAgfVxuICAgIGlmKGlzUG90KXtcbiAgICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAoZ2wuVEVYVFVSRV8yRCk7XG4gICAgfVxuICAgIC8vIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIG51bGwpO1xuICAgIHJldHVybiB0ZXh0dXJlO1xufVxuXG5mdW5jdGlvbiBzZXR1cFRleHR1cmVzKGdsLCBvcHRpb25zKXtcbiAgICBpZihvcHRpb25zLm5vcm1hbE1hcCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoJ25vcm1hbG1hcCgpIG5vcm1hbE1hcCBhdHRyaWJ1dGUgaXMgcmVxdWlyZWQnKTtcblxuICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyBOT1JNQUxfU0FNUExFUik7XG4gICAgaW1hZ2VUb1RleHR1cmUoZ2wsIG9wdGlvbnMubm9ybWFsTWFwLCBnbC5SR0JBLCBvcHRpb25zLnJlcGVhdCk7XG5cbiAgICBpZihvcHRpb25zLmJhc2VDb2xvck1hcCkge1xuICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwICsgQkFTRV9DT0xPUl9TQU1QTEVSKTtcbiAgICAgICAgaW1hZ2VUb1RleHR1cmUoZ2wsIG9wdGlvbnMuYmFzZUNvbG9yTWFwLCBnbC5SR0IsIG9wdGlvbnMucmVwZWF0KTtcbiAgICB9XG5cbiAgICBpZihvcHRpb25zLm1hdGVyaWFsTWFwKSB7XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyBNQVRFUklBTF9TQU1QTEVSKTtcbiAgICAgICAgaW1hZ2VUb1RleHR1cmUoZ2wsIG9wdGlvbnMubWF0ZXJpYWxNYXAsIGdsLlJHQiwgb3B0aW9ucy5yZXBlYXQpO1xuICAgIH1cblxuICAgIGlmKG9wdGlvbnMuYW1iaWVudE1hcCkge1xuICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwICsgQU1CSUVOVF9TQU1QTEVSKTtcbiAgICAgICAgaW1hZ2VUb1RleHR1cmUoZ2wsIG9wdGlvbnMuYW1iaWVudE1hcCwgZ2wuUkdCQSwgb3B0aW9ucy5yZXBlYXQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0J1ZmZlcihnbCl7XG4gICAgZ2wuZHJhd0FycmF5cyhnbC5UUklBTkdMRV9TVFJJUCwgMCwgNCk7XG59XG5cbmZ1bmN0aW9uIGFzc2lnbihhKXtcbiAgICBmb3IodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgdmFyIGIgPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGZvcih2YXIga2V5IGluIGIpe1xuICAgICAgICAgICAgaWYoYi5oYXNPd25Qcm9wZXJ0eShrZXkpKSBhW2tleV0gPSBiW2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGE7XG59XG5cbmZ1bmN0aW9uIHZlYzMoeCwgeSwgeil7XG4gICAgdmFyIHYgPSBuZXcgRmxvYXQzMkFycmF5KDMpO1xuICAgIHZbMF0gPSB4OyB2WzFdID0geTsgdlsyXSA9IHo7XG4gICAgcmV0dXJuIHY7XG59XG5ub3JtYWxtYXAudmVjMyA9IHZlYzM7XG5cbmZ1bmN0aW9uIGlzSW1hZ2VQb3dlck9mVHdvKGltYWdlKXtcbiAgICByZXR1cm4gaXNQb3dlck9mVHdvKGltYWdlLm5hdHVyYWxXaWR0aCB8fCBpbWFnZS53aWR0aCkgJiZcbiAgICAgICAgaXNQb3dlck9mVHdvKGltYWdlLm5hdHVyYWxIZWlnaHQgfHwgaW1hZ2UuaGVpZ2h0KTtcbn1cblxuZnVuY3Rpb24gaXNQb3dlck9mVHdvKHgpIHtcbiAgcmV0dXJuICgoeCAhPT0gMCkgJiYgISh4ICYgKHggLSAxKSkpO1xufVxuIiwidmFyIFNoYWRlciA9IHJlcXVpcmUoJy4vc2hhZGVyJyk7XG5cbmZ1bmN0aW9uIFNoYWRlck1hbmFnZXIoZ2wsIHNvdXJjZXMsIG9wdGlvbnMpe1xuICAgIHRoaXMuZ2wgPSBnbDtcbiAgICB0aGlzLnNvdXJjZXMgPSBzb3VyY2VzO1xuICAgIHRoaXMuc2hhZGVycyA9IFtdO1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMucHJlZml4ID0gb3B0aW9ucy5wcmVmaXggfHwgJyc7XG4gICAgdGhpcy5zb3VyY2VJZHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIHRoaXMuc291cmNlSWQgPSAxO1xufVxubW9kdWxlLmV4cG9ydHMgPSBTaGFkZXJNYW5hZ2VyO1xuU2hhZGVyTWFuYWdlci5wcm90b3R5cGUgPSB7XG4gICAgaW5jbHVkZUV4cHJlc3Npb246IC8jaW5jbHVkZSBcIihbXlwiXSspXCIvLFxuICAgIHByZXByb2Nlc3M6IGZ1bmN0aW9uKG5hbWUsIGNvbnRlbnQsIGluY2x1ZGVkKSB7XG4gICAgICAgIHZhciBzb3VyY2VJZCA9IHRoaXMuZ2V0U291cmNlSWQobmFtZSk7XG4gICAgICAgIHZhciBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgICB2YXIgb3V0cHV0ID0gWycjbGluZSAxICcgKyBzb3VyY2VJZF07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gbGluZXNbaV07XG4gICAgICAgICAgICB2YXIgbWF0Y2ggPSBsaW5lLm1hdGNoKHRoaXMuaW5jbHVkZUV4cHJlc3Npb24pO1xuICAgICAgICAgICAgaWYobWF0Y2gpe1xuICAgICAgICAgICAgICAgIHZhciBpbmNsdWRlID0gbWF0Y2hbMV07XG4gICAgICAgICAgICAgICAgaWYoIWluY2x1ZGVkW2luY2x1ZGVdKXtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0LnB1c2godGhpcy5nZXRTb3VyY2UoaW5jbHVkZSwge30sIGluY2x1ZGVkKSk7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dC5wdXNoKCcjbGluZSAnICsgKGkrMikgKyAnICcgKyBzb3VyY2VJZCk7XG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGVkW2luY2x1ZGVdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dC5wdXNoKCcvLyAnICsgbGluZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgb3V0cHV0LnB1c2gobGluZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG91dHB1dC5qb2luKCdcXG4nKTtcbiAgICB9LFxuICAgIGdldFNvdXJjZTogZnVuY3Rpb24obmFtZSwgZGVmaW5lcywgaW5jbHVkZWQpIHtcbiAgICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvXFwuXFx3KyQvLCAnJyk7XG4gICAgICAgIHZhciBjb250ZW50ID0gdGhpcy5zb3VyY2VzW3RoaXMucHJlZml4ICsgbmFtZV07XG4gICAgICAgIGlmKGNvbnRlbnQgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdzaGFkZXIgbm90IGZvdW5kICcgKyBuYW1lKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZ2xzbERlZmluZXMoZGVmaW5lcykgKyB0aGlzLnByZXByb2Nlc3MobmFtZSwgY29udGVudCwgaW5jbHVkZWQpO1xuICAgIH0sXG4gICAgZ2V0U291cmNlSWQ6IGZ1bmN0aW9uKG5hbWUpe1xuICAgICAgICBpZighKG5hbWUgaW4gdGhpcy5zb3VyY2VJZHMpKXtcbiAgICAgICAgICAgIHRoaXMuc291cmNlSWRzW25hbWVdID0gdGhpcy5zb3VyY2VJZCsrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNvdXJjZUlkc1tuYW1lXTtcbiAgICB9LFxuICAgIGdldFNvdXJjZU5hbWU6IGZ1bmN0aW9uKHNvdXJjZUlkKSB7XG4gICAgICAgIHZhciBzb3VyY2VJZHMgPSB0aGlzLnNvdXJjZUlkcztcbiAgICAgICAgZm9yKHZhciBuYW1lIGluIHNvdXJjZUlkcyl7XG4gICAgICAgICAgICBpZihzb3VyY2VJZHNbbmFtZV0gPT09IHNvdXJjZUlkKSByZXR1cm4gbmFtZTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgZ2V0OiBmdW5jdGlvbih2ZXJ0ZXgsIGZyYWcsIGRlZmluZXMpIHtcbiAgICAgICAgaWYoIWZyYWcpIHtcbiAgICAgICAgICAgIGZyYWcgPSB2ZXJ0ZXg7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGtleSA9IEpTT04uc3RyaW5naWZ5KFt2ZXJ0ZXgsIGZyYWcsIGRlZmluZXNdKTtcbiAgICAgICAgaWYoIShrZXkgaW4gdGhpcy5zaGFkZXJzKSl7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hhZGVyc1trZXldID0gbmV3IFNoYWRlcih0aGlzLmdsLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdldFNvdXJjZSh2ZXJ0ZXgsIGRlZmluZXMsIHt9KSxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTb3VyY2UoZnJhZywgZGVmaW5lcywge30pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIHRocm93IHRoaXMucmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNoYWRlcnNba2V5XTtcbiAgICB9LFxuICAgIHJlc29sdmVFcnJvcjogZnVuY3Rpb24oZSkge1xuICAgICAgICBpZighZS5tZXNzYWdlIHx8ICFlLm1lc3NhZ2UubWF0Y2goL1NoYWRlciAoY29tcGlsZXJ8bGlua2VyKSBlcnJvcjovKSkge1xuICAgICAgICAgICAgcmV0dXJuIGU7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNvdXJjZUlkRXhwcmVzc2lvbiA9IC8oRVJST1I6ICkoXFxkKykoOlxcZCs6KS9nO1xuICAgICAgICB2YXIgbWVzc2FnZSA9IGUubWVzc2FnZS5yZXBsYWNlKHNvdXJjZUlkRXhwcmVzc2lvbiwgZnVuY3Rpb24oXywgaGVhZCwgc291cmNlSWQsIHRhaWwpe1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IHRoaXMuZ2V0U291cmNlTmFtZShzb3VyY2VJZCoxICApIHx8ICd1bmtub3duLScgKyBzb3VyY2VJZDtcbiAgICAgICAgICAgIHJldHVybiBoZWFkICsgc291cmNlICsgdGFpbDtcbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgICAgaWYobWVzc2FnZSA9PT0gZS5tZXNzYWdlKSByZXR1cm4gZTtcbiAgICAgICAgcmV0dXJuIG5ldyBFcnJvcihtZXNzYWdlKTtcblxuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGdsc2xEZWZpbmVzKGRlZmluZXMpe1xuICAgIGlmKCFkZWZpbmVzKSByZXR1cm4gJyc7XG4gICAgdmFyIG91dHB1dCA9IFtdO1xuICAgIGZvcih2YXIga2V5IGluIGRlZmluZXMpe1xuICAgICAgICBpZihkZWZpbmVzW2tleV0gIT0gbnVsbCl7XG4gICAgICAgICAgICBvdXRwdXQucHVzaCgnI2RlZmluZSAnICsga2V5ICsgJyAnICsgZGVmaW5lc1trZXldKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0LmpvaW4oJ1xcbicpO1xufVxuIiwiZnVuY3Rpb24gU2hhZGVyKGdsLCB2ZXJ0ZXhTb3VyY2UsIGZyYWdtZW50U291cmNlKXtcbiAgICB0aGlzLmdsID0gZ2w7XG4gICAgY29uc29sZS5sb2coZnJhZ21lbnRTb3VyY2UpO1xuICAgIHRoaXMucHJvZ3JhbSA9IGJ1aWxkUHJvZ3JhbShnbCwgdmVydGV4U291cmNlLCBmcmFnbWVudFNvdXJjZSk7XG4gICAgdGhpcy51bmlmb3JtSW5mb3MgPSByZWZsZWN0VW5pZm9ybUluZm9ybWF0aW9uKGdsLCB0aGlzLnByb2dyYW0pO1xuICAgIHRoaXMudW5pZm9ybVZhbHVlcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgdGhpcy51bmlmb3JtVHlwZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIHRoaXMuYXR0cmlidXRlTG9jYXRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gU2hhZGVyO1xuU2hhZGVyLnByb3RvdHlwZSA9IHtcbiAgICB1c2U6IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLmdsLnVzZVByb2dyYW0odGhpcy5wcm9ncmFtKTtcbiAgICB9LFxuICAgIC8vIGRvZXMgbm90IGNoZWNrIGZvciBoYXNPd25Qcm9wZXJ0eSBvbiB2YWx1ZXNcbiAgICAvLyBhbGxvd3MgZm9yIHByb3RvdHlwaWNhbCBpbmhlcml0YW5jZVxuICAgIHVuaWZvcm1zOiBmdW5jdGlvbiAodmFsdWVzKSB7XG4gICAgICAgIGZvcih2YXIgbmFtZSBpbiB2YWx1ZXMpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0VW5pZm9ybShuYW1lLCB2YWx1ZXNbbmFtZV0pO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBzZXRVbmlmb3JtOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSl7XG4gICAgICAgIHZhciBpbmZvID0gdGhpcy51bmlmb3JtSW5mb3NbbmFtZV07XG4gICAgICAgIGlmKCFpbmZvKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ3NoYWRlciBtaXNzaW5nIHVuaWZvcm0nLCBuYW1lKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdHlwZSA9IGluZm8udHlwZTtcbiAgICAgICAgaWYoaXNVbmlmb3JtVHlwZVNjYWxhcih0aGlzLmdsLCB0eXBlKSl7XG4gICAgICAgICAgICBpZih2YWx1ZSA9PT0gdGhpcy51bmlmb3JtVmFsdWVzW25hbWVdKXtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1WYWx1ZXNbbmFtZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBvbGRWYWx1ZSA9IHRoaXMudW5pZm9ybVZhbHVlc1tuYW1lXTtcbiAgICAgICAgICAgIGlmKG9sZFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBpZihjb21wYXJlQW5kU2V0KG9sZFZhbHVlLCB2YWx1ZSkpIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMudW5pZm9ybVZhbHVlc1tuYW1lXSA9IG5ldyBGbG9hdDMyQXJyYXkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHNldFVuaWZvcm0odGhpcy5nbCwgaW5mby5sb2NhdGlvbiwgdHlwZSwgdmFsdWUpO1xuICAgIH0sXG4gICAgZ2V0VW5pZm9ybUxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgIGlmKCEobmFtZSBpbiB0aGlzLnVuaWZvcm1Mb2NhdGlvbnMpKXtcbiAgICAgICAgICAgIHZhciBsb2NhdGlvbiA9IHRoaXMuZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHRoaXMucHJvZ3JhbSwgbmFtZSk7XG4gICAgICAgICAgICBpZihsb2NhdGlvbiA8IDApe1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2Fybignc2hhZGVyIG1pc3NpbmcgdW5pZm9ybScsIG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy51bmlmb3JtTG9jYXRpb25zW25hbWVdID0gbG9jYXRpb247XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMudW5pZm9ybUxvY2F0aW9uc1tuYW1lXTtcbiAgICB9LFxuICAgIGdldEF0dHJpYkxvY2F0aW9uOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgIGlmKCEobmFtZSBpbiB0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucykpe1xuICAgICAgICAgICAgdmFyIGxvY2F0aW9uID0gdGhpcy5nbC5nZXRBdHRyaWJMb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuICAgICAgICAgICAgaWYobG9jYXRpb24gPCAwKXtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ3NoYWRlciBtaXNzaW5nIGF0dHJpYnV0ZScsIG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnNbbmFtZV0gPSBsb2NhdGlvbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnNbbmFtZV07XG4gICAgfVxufTtcblxuZnVuY3Rpb24gaXNVbmlmb3JtVHlwZVNjYWxhcihnbCwgdHlwZSl7XG4gICAgc3dpdGNoKHR5cGUpe1xuICAgICAgICBjYXNlIGdsLkZMT0FUOlxuICAgICAgICBjYXNlIGdsLklOVDpcbiAgICAgICAgY2FzZSBnbC5VTlNJR05FRF9JTlQ6XG4gICAgICAgIGNhc2UgZ2wuU0FNUExFUl8yRDpcbiAgICAgICAgY2FzZSBnbC5TQU1QTEVSX0NVQkU6XG4gICAgICAgIGNhc2UgZ2wuQk9PTDpcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gc2V0VW5pZm9ybShnbCwgbG9jYXRpb24sIHR5cGUsIHZhbHVlKXtcbiAgICBzd2l0Y2godHlwZSkge1xuICAgICAgICBjYXNlIGdsLkZMT0FUOlxuICAgICAgICAgICAgZ2wudW5pZm9ybTFmKGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBnbC5JTlQ6XG4gICAgICAgIGNhc2UgZ2wuVU5TSUdORURfSU5UOlxuICAgICAgICBjYXNlIGdsLlNBTVBMRVJfMkQ6XG4gICAgICAgIGNhc2UgZ2wuU0FNUExFUl9DVUJFOlxuICAgICAgICBjYXNlIGdsLkJPT0w6XG4gICAgICAgICAgICBnbC51bmlmb3JtMWkobG9jYXRpb24sIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGdsLkZMT0FUX1ZFQzM6XG4gICAgICAgICAgICBnbC51bmlmb3JtM2Z2KGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBnbC5GTE9BVF9WRUMyOlxuICAgICAgICAgICAgZ2wudW5pZm9ybTJmdihsb2NhdGlvbiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZ2wuRkxPQVRfVkVDNDpcbiAgICAgICAgICAgIGdsLnVuaWZvcm00ZnYobG9jYXRpb24sIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGdsLkZMT0FUX01BVDQ6XG4gICAgICAgICAgICBnbC51bmlmb3JtTWF0cml4NGZ2KGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBnbC5GTE9BVF9NQVQzOlxuICAgICAgICAgICAgZ2wudW5pZm9ybU1hdHJpeDNmdihsb2NhdGlvbiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZ2wuRkxPQVRfTUFUMjpcbiAgICAgICAgICAgIGdsLnVuaWZvcm1NYXRyaXgyZnYobG9jYXRpb24sIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGdsLklOVF9WRUMzOlxuICAgICAgICAgICAgZ2wudW5pZm9ybTNpdihsb2NhdGlvbiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZ2wuSU5UX1ZFQzI6XG4gICAgICAgICAgICBnbC51bmlmb3JtMml2KGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBnbC5JTlRfVkVDNDpcbiAgICAgICAgICAgIGdsLnVuaWZvcm00aXYobG9jYXRpb24sIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdVbmtub3duIHVuaWZvcm0gdHlwZScsIG5hbWUsIHR5cGUpO1xuICAgIH1cblxufVxuXG5mdW5jdGlvbiByZWZsZWN0VW5pZm9ybUluZm9ybWF0aW9uKGdsLCBwcm9ncmFtKXtcbiAgICB2YXIgdW5pZm9ybXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIHZhciBuQWN0aXZlVW5pZm9ybXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkFDVElWRV9VTklGT1JNUyk7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IG5BY3RpdmVVbmlmb3JtczsgaSsrKXtcbiAgICAgICAgdmFyIHVuaWZvcm0gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpO1xuICAgICAgICB1bmlmb3Jtc1t1bmlmb3JtLm5hbWVdID0ge1xuICAgICAgICAgICAgdHlwZTogdW5pZm9ybS50eXBlLFxuICAgICAgICAgICAgc2l6ZTogdW5pZm9ybS5zaXplLFxuICAgICAgICAgICAgbG9jYXRpb246IGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCB1bmlmb3JtLm5hbWUpXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB1bmlmb3Jtcztcbn1cblxuZnVuY3Rpb24gY29tcGlsZVNoYWRlcihnbCwgdHlwZSwgc291cmNlKXtcbiAgICB2YXIgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpO1xuICAgIGdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNvdXJjZSk7XG4gICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpO1xuICAgIGlmKCFnbC5nZXRTaGFkZXJQYXJhbWV0ZXIoc2hhZGVyLCBnbC5DT01QSUxFX1NUQVRVUykpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1NoYWRlciBjb21waWxlciBlcnJvcjogXCInICsgZ2wuZ2V0U2hhZGVySW5mb0xvZyhzaGFkZXIpICsgJ1wiJyk7XG4gICAgfVxuICAgIHJldHVybiBzaGFkZXI7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUHJvZ3JhbShnbCwgdmVydGV4U2hhZGVyU291cmNlLCBmcmFnbWVudFNoYWRlclNvdXJjZSl7XG4gICAgdmFyIGZyYWdtZW50U2hhZGVyID0gY29tcGlsZVNoYWRlcihnbCwgZ2wuRlJBR01FTlRfU0hBREVSLCBmcmFnbWVudFNoYWRlclNvdXJjZSk7XG4gICAgdmFyIHZlcnRleFNoYWRlciA9IGNvbXBpbGVTaGFkZXIoZ2wsIGdsLlZFUlRFWF9TSEFERVIsIHZlcnRleFNoYWRlclNvdXJjZSk7XG4gICAgdmFyIHByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKCk7XG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIHZlcnRleFNoYWRlcik7XG4gICAgZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0sIGZyYWdtZW50U2hhZGVyKTtcbiAgICBnbC5iaW5kQXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgMCwgXCJhUG9zaXRpb25cIik7XG4gICAgZ2wubGlua1Byb2dyYW0ocHJvZ3JhbSk7XG4gICAgaWYoIWdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgZ2wuTElOS19TVEFUVVMpKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTaGFkZXIgbGlua2VyIGVycm9yOiAnICsgZ2wuZ2V0UHJvZ3JhbUluZm9Mb2cocHJvZ3JhbSkpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvZ3JhbTtcbn1cblxuLy8gc2V0cyBhIHRvIGJcbi8vIHJldHVybnMgdHJ1ZSBpZiBhIHdhcyBlcXVhbCB0byBiIGFscmVhZHlcbmZ1bmN0aW9uIGNvbXBhcmVBbmRTZXQoYSwgYil7XG4gICAgdmFyIGVxdWFsID0gdHJ1ZTtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKyl7XG4gICAgICAgIGlmKGFbaV0gIT09IGJbaV0pe1xuICAgICAgICAgICAgYVtpXSA9IGJbaV07XG4gICAgICAgICAgICBlcXVhbCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBlcXVhbDtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gXCIjaWZkZWYgVVNFX0FNQklFTlRfTUFQXFxudW5pZm9ybSBzYW1wbGVyMkQgdUFtYmllbnRTYW1wbGVyO1xcbnVuaWZvcm0gZmxvYXQgdUFtYmllbnQ7XFxuXFxudm9pZCBhZGRBbWJpZW50KGlub3V0IHZlYzQgZnJhZ0NvbG9yKXtcXG4gICAgdmVjNCBhbWJpZW50ID0gdGV4dHVyZTJEKHVBbWJpZW50U2FtcGxlciwgdlV2KTtcXG4gICAgYW1iaWVudC5yZ2IgKj0gdUFtYmllbnQgKiBhbWJpZW50LmE7XFxuICAgIGZyYWdDb2xvci5yZ2IgPSBmcmFnQ29sb3IucmdiKmZyYWdDb2xvci5hICsgYW1iaWVudC5yZ2I7XFxuICAgIC8vIHRoaXMgaXMgYSBiaXQgb2YgYSBoYWNrIGJ1dCBpdCBhbGxvd3MgZm9yIGEgc2VwYXJhdGUgYWxwaGEgaW4gYm90aFxcbiAgICAvLyB3aGlsZSBub3QgbWVzc2luZyB1cCB3aGVuIHRoZXkgYXJlIGJsZW5kZWRcXG4gICAgZnJhZ0NvbG9yLmEgPSBtYXgoZnJhZ0NvbG9yLmEsIGFtYmllbnQuYSk7XFxufVxcbiNlbmRpZlxcblwiO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBcIiNpbmNsdWRlIFxcXCJjb21tb24uZ2xzbFxcXCJcXG5cXG4vLyBFcGljIGFwcHJveGltYXRpb24gb2Ygc2NobGlja3NcXG4vLyBGMCBpcyB0aGUgc3BlY3VsYXIgcmVmbGVjdGFuY2UgYXQgbm9ybWFsIGluY2lkZW5jZS5cXG4vLyB2aWE6IGh0dHA6Ly9ibG9nLnNlbGZzaGFkb3cuY29tL3B1YmxpY2F0aW9ucy9zMjAxMy1zaGFkaW5nLWNvdXJzZS9rYXJpcy9zMjAxM19wYnNfZXBpY19ub3Rlc192Mi5wZGZcXG52ZWMzIEZfc2NobGljayggdmVjMyBGMCwgZmxvYXQgZG90TEggKSB7XFxuXFx0ZmxvYXQgZnJlc25lbCA9IGV4cDIoICggLTUuNTU0NzMgKiBkb3RMSCAtIDYuOTgzMTYgKSAqIGRvdExIICk7XFxuXFx0cmV0dXJuICggMS4wIC0gRjAgKSAqIGZyZXNuZWwgKyBGMDtcXG59XFxuXFxuLy8gbm9ybWFsIGRpc3RyaWJ1dGlvblxcbi8vIGFscGhhID0gcm91Z2huZXNzXjJcXG4vLyB2aWE6IGh0dHA6Ly9ibG9nLnNlbGZzaGFkb3cuY29tL3B1YmxpY2F0aW9ucy9zMjAxMy1zaGFkaW5nLWNvdXJzZS9rYXJpcy9zMjAxM19wYnNfZXBpY19ub3Rlc192Mi5wZGZcXG5mbG9hdCBEX2dneChjb25zdCBpbiBmbG9hdCBkb3ROSCwgY29uc3QgaW4gZmxvYXQgYWxwaGEpIHtcXG4gICAgZmxvYXQgYWxwaGFTcXVhcmVkID0gYWxwaGEgKiBhbHBoYTtcXG4gICAgZmxvYXQgZGVub21pbmF0b3IgPSBkb3ROSCpkb3ROSCAqIChhbHBoYVNxdWFyZWQgLSAxLjApICsgMS4wO1xcbiAgICByZXR1cm4gKGFscGhhU3F1YXJlZCkgLyAoUEkgKiBkZW5vbWluYXRvcipkZW5vbWluYXRvcik7XFxufVxcblxcbi8vIGdlb21ldHJpYyBhdHRlbnVhdGlvblxcbi8vIGh0dHA6Ly9ibG9nLnNlbGZzaGFkb3cuY29tL3B1YmxpY2F0aW9ucy9zMjAxMy1zaGFkaW5nLWNvdXJzZS9rYXJpcy9zMjAxM19wYnNfZXBpY19ub3Rlc192Mi5wZGZcXG5mbG9hdCBHX2dneChjb25zdCBpbiBmbG9hdCBkb3ROTCwgY29uc3QgaW4gZmxvYXQgZG90TlYsIGNvbnN0IGluIGZsb2F0IHJvdWdobmVzcykge1xcbiAgICBmbG9hdCBrID0gKHJvdWdobmVzcyArIDEuMCk7XFxuICAgIGsgPSBrKmsgLyA4LjA7XFxuICAgIGZsb2F0IGwgPSBkb3ROTCAvICggZG90TkwgKiAoMS4wLWspICsgayk7XFxuICAgIGZsb2F0IHYgPSBkb3ROViAvICggZG90TlYgKiAoMS4wLWspICsgayk7XFxuICAgIHJldHVybiBsICogdjtcXG59XFxuXFxuLy8gbiA9IG5vcm1hbFxcbi8vIGwgPSBsaWdodCBkaXJlY3Rpb25cXG4vLyB2ID0gdmlldyBkaXJlY3Rpb25cXG4vLyBGMCBzcGVjdWxhciBjb2xvclxcbi8vIGggPSBoYWxmIGFuZ2xlIGJldHdlZW4gbCBhbmQgdlxcbnZlYzMgYnJkZl9nZ3godmVjMyBuLCB2ZWMzIGwsIHZlYzMgdiwgdmVjMyBGMCwgZmxvYXQgcm91Z2huZXNzKSB7XFxuICAgIGZsb2F0IGFscGhhID0gcm91Z2huZXNzICogcm91Z2huZXNzO1xcbiAgICB2ZWMzIGggPSBub3JtYWxpemUobCArIHYpO1xcblxcbiAgICBmbG9hdCBkb3ROTCA9IHNhdHVyYXRlKGRvdChuLCBsKSk7XFxuICAgIGZsb2F0IGRvdE5WID0gc2F0dXJhdGUoZG90KG4sIHYpKTtcXG4gICAgZmxvYXQgZG90TkggPSBzYXR1cmF0ZShkb3QobiwgaCkpO1xcbiAgICBmbG9hdCBkb3RMSCA9IHNhdHVyYXRlKGRvdChsLCBoKSk7XFxuXFxuICAgIHZlYzMgRiA9IEZfc2NobGljayhGMCwgZG90TEgpO1xcbiAgICBmbG9hdCBEID0gRF9nZ3goZG90TkgsIGFscGhhKTtcXG4gICAgZmxvYXQgRyA9IEdfZ2d4KGRvdE5MLCBkb3ROViwgcm91Z2huZXNzKTtcXG5cXG4gICAgcmV0dXJuIEYgKiAoIEcgKiBEICk7XFxufVxcblwiO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBcIiNkZWZpbmUgc2F0dXJhdGUoeCkgY2xhbXAoeCwgMC4wLCAxLjApXFxuY29uc3QgZmxvYXQgUEkgPSAzLjE0MTU5MjY1MzU5O1xcbmNvbnN0IGZsb2F0IFJFQ0lQUk9DQUxfUEkgPSAxLjAgLyBQSTtcXG5jb25zdCBmbG9hdCBFUFNJTE9OID0gMWUtMzA7XFxuXFxuZmxvYXQgZ2FtbWFFbmNvZGUoY29uc3QgaW4gZmxvYXQgbGluZWFyKXtcXG4gICAgcmV0dXJuIHBvdyhsaW5lYXIsIDEuMC8yLjIpO1xcbn1cXG52ZWMzIGdhbW1hRW5jb2RlKGNvbnN0IGluIHZlYzMgbGluZWFyKSB7XFxuICAgIHJldHVybiBwb3cobGluZWFyLCB2ZWMzKDEuMC8yLjIpKTtcXG59XFxudmVjNCBnYW1tYUVuY29kZShjb25zdCBpbiB2ZWM0IGxpbmVhcikge1xcbiAgICByZXR1cm4gdmVjNChwb3cobGluZWFyLnJnYiwgdmVjMygxLjAvMi4yKSksIGxpbmVhci5hKTtcXG59XFxuXFxudmVjMyBnYW1tYURlY29kZShjb25zdCBpbiB2ZWMzIGxpbmVhcikge1xcbiAgICByZXR1cm4gcG93KGxpbmVhciwgdmVjMygyLjIpKTtcXG59XFxuXCI7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFwiLy8gYmFzZWQgb24gbnZpZGlhIGZ4YWEgMy4xMSBjb25zb2xlIGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2JrYXJhZHppYy82MDExNDMxXFxuLy8gaHR0cHM6Ly9naXRodWIuY29tL21pdHN1aGlrby93ZWJnbC1tZWluY3JhZnQvYmxvYi9tYXN0ZXIvYXNzZXRzL3NoYWRlcnMvZnhhYS5nbHNsXFxuLy8gaXQgaGFzIGJlZW4gbW9kaWZpZWQgd2l0aCBsaXR0bGUgdGVzdGluZyBhbmQgaXMgcXVpdGUgcG9zc2libHkgYnJva2VuIG5vdy5cXG5cXG4vLyAgIDAuMTI1IGxlYXZlcyBsZXNzIGFsaWFzaW5nLCBidXQgaXMgc29mdGVyIChkZWZhdWx0ISEhKVxcbi8vICAgMC4yNSBsZWF2ZXMgbW9yZSBhbGlhc2luZywgYW5kIGlzIHNoYXJwZXJcXG5jb25zdCBmbG9hdCBmeGFhRWRnZVRocmVzaG9sZCA9IDAuMTI1O1xcbi8vICAgMC4wNiAtIGZhc3RlciBidXQgbW9yZSBhbGlhc2luZyBpbiBkYXJrc1xcbi8vICAgMC4wNSAtIGRlZmF1bHRcXG4vLyAgIDAuMDQgLSBzbG93ZXIgYW5kIGxlc3MgYWxpYXNpbmcgaW4gZGFya3NcXG5jb25zdCBmbG9hdCBmeGFhQ29uc29sZUVkZ2VUaHJlc2hvbGRNaW4gPSAwLjAwO1xcblxcbi8vICAgOC4wIGlzIHNoYXJwZXIgKGRlZmF1bHQhISEpXFxuLy8gICA0LjAgaXMgc29mdGVyXFxuLy8gICAyLjAgaXMgcmVhbGx5IHNvZnQgKGdvb2Qgb25seSBmb3IgdmVjdG9yIGdyYXBoaWNzIGlucHV0cylcXG5jb25zdCBmbG9hdCBmeGFhQ29uc29sZUVkZ2VTaGFycG5lc3MgPSA4LjA7XFxuXFxuLy8gZm9yIHNvbWUgcmVhc29uIGZ4YWEgd2FudHMgZ2FtbWEgZW5jb2RlZCB2YWx1ZXNcXG4vLyBzbyBJIGdhbW1hIGVuY29kZSBvbiB0aGUgZmx5XFxuZmxvYXQgZnhhYUx1bWEodmVjNCBjb2xvcil7XFxuICAgIGNvbnN0IHZlYzQgbHVtYSA9IHZlYzQoMC4yOTksIDAuNTg3LCAwLjExNCwgMC4wKTtcXG4gICAgcmV0dXJuIGdhbW1hRW5jb2RlKGRvdChzYXR1cmF0ZShjb2xvciksIGx1bWEpKTtcXG59XFxuXFxudmVjNCBmeGFhKHZlYzIgdXYsIGNvbnN0IHZlYzIgcmVzb2x1dGlvbiwgc2FtcGxlcjJEIHNhbXBsZXIpIHtcXG4gICAgLy8gICAgIE4gPSAwLjUwIChkZWZhdWx0KVxcbiAgICAvLyAgICAgTiA9IDAuMzMgKHNoYXJwZXIpXFxuICAgIHZlYzQgZnhhYUNvbnNvbGVSY3BGcmFtZU9wdCA9IHZlYzQoMC4zMykgLyB2ZWM0KC1yZXNvbHV0aW9uLngsIC1yZXNvbHV0aW9uLnksIHJlc29sdXRpb24ueCwgcmVzb2x1dGlvbi55KTtcXG4gICAgdmVjNCBmeGFhQ29uc29sZVJjcEZyYW1lT3B0MiA9IHZlYzQoMi4wKSAvIHZlYzQoLXJlc29sdXRpb24ueCwgLXJlc29sdXRpb24ueSwgcmVzb2x1dGlvbi54LCByZXNvbHV0aW9uLnkpO1xcblxcbiAgICAvLyB2ZWMyIGludmVyc2VWUCA9IHZlYzIoMS4wIC8gdVZpZXdwb3J0U2l6ZS54LCAxLjAgLyB1Vmlld3BvcnRTaXplLnkpO1xcbiAgICB2ZWMyIHBpeGVsT2Zmc2V0ID0gdmVjMigxLjApL3Jlc29sdXRpb247XFxuXFxuICAgIHZlYzQgcmdiTncgPSB0ZXh0dXJlMkQoc2FtcGxlciwgKHV2ICsgdmVjMigtMS4wLCAtMS4wKSkgKiBwaXhlbE9mZnNldCk7XFxuICAgIHZlYzQgcmdiTmUgPSB0ZXh0dXJlMkQoc2FtcGxlciwgKHV2ICsgdmVjMigxLjAsIC0xLjApKSAqIHBpeGVsT2Zmc2V0KTtcXG4gICAgdmVjNCByZ2JTdyA9IHRleHR1cmUyRChzYW1wbGVyLCAodXYgKyB2ZWMyKC0xLjAsIDEuMCkpICogcGl4ZWxPZmZzZXQpO1xcbiAgICB2ZWM0IHJnYlNlID0gdGV4dHVyZTJEKHNhbXBsZXIsICh1diArIHZlYzIoMS4wLCAxLjApKSAqIHBpeGVsT2Zmc2V0KTtcXG4gICAgdmVjNCByZ2JNICA9IHRleHR1cmUyRChzYW1wbGVyLCB1dik7XFxuXFxuICAgIC8vIGZmeGFhIHdhbnRzIGx1bWEgdG8gYmVcXG4gICAgZmxvYXQgbHVtYU53ID0gZnhhYUx1bWEocmdiTncpO1xcbiAgICBmbG9hdCBsdW1hTmUgPSBmeGFhTHVtYShyZ2JOZSk7XFxuICAgIGZsb2F0IGx1bWFTdyA9IGZ4YWFMdW1hKHJnYlN3KTtcXG4gICAgZmxvYXQgbHVtYVNlID0gZnhhYUx1bWEocmdiU2UpO1xcbiAgICBmbG9hdCBsdW1hTSAgPSBmeGFhTHVtYShyZ2JNKTtcXG5cXG4gICAgZmxvYXQgbHVtYU1heE53U3cgPSBtYXgobHVtYU53LCBsdW1hU3cpO1xcbiAgICBsdW1hTmUgKz0gMS4wLzM4NC4wO1xcbiAgICBmbG9hdCBsdW1hTWluTndTdyA9IG1pbihsdW1hTncsIGx1bWFTdyk7XFxuXFxuICAgIGZsb2F0IGx1bWFNYXhOZVNlID0gbWF4KGx1bWFOZSwgbHVtYVNlKTtcXG4gICAgZmxvYXQgbHVtYU1pbk5lU2UgPSBtaW4obHVtYU5lLCBsdW1hU2UpO1xcblxcbiAgICBmbG9hdCBsdW1hTWF4ID0gbWF4KGx1bWFNYXhOZVNlLCBsdW1hTWF4TndTdyk7XFxuICAgIGZsb2F0IGx1bWFNaW4gPSBtaW4obHVtYU1pbk5lU2UsIGx1bWFNaW5Od1N3KTtcXG5cXG4gICAgZmxvYXQgbHVtYU1heFNjYWxlZCA9IGx1bWFNYXggKiBmeGFhRWRnZVRocmVzaG9sZDtcXG5cXG4gICAgZmxvYXQgbHVtYU1pbk0gPSBtaW4obHVtYU1pbiwgbHVtYU0pO1xcbiAgICBmbG9hdCBsdW1hTWF4U2NhbGVkQ2xhbXBlZCA9IG1heChmeGFhQ29uc29sZUVkZ2VUaHJlc2hvbGRNaW4sIGx1bWFNYXhTY2FsZWQpO1xcbiAgICBmbG9hdCBsdW1hTWF4TSA9IG1heChsdW1hTWF4LCBsdW1hTSk7XFxuICAgIGZsb2F0IGRpclN3TWludXNOZSA9IGx1bWFTdyAtIGx1bWFOZTtcXG4gICAgZmxvYXQgbHVtYU1heFN1Yk1pbk0gPSBsdW1hTWF4TSAtIGx1bWFNaW5NO1xcbiAgICBmbG9hdCBkaXJTZU1pbnVzTncgPSBsdW1hU2UgLSBsdW1hTnc7XFxuICAgIC8vIGVhcmx5IG91dFxcbiAgICAvLyBpZihsdW1hTWF4U3ViTWluTSA8IGx1bWFNYXhTY2FsZWRDbGFtcGVkKSByZXR1cm4gdmVjNCgxLjAsIDAuMCwgMC4wLCAxLjApO1xcbiAgICBpZihsdW1hTWF4U3ViTWluTSA8IGx1bWFNYXhTY2FsZWRDbGFtcGVkKSByZXR1cm4gcmdiTTtcXG5cXG4gICAgdmVjMiBkaXIgPSBkaXJTd01pbnVzTmUgKyB2ZWMyKGRpclNlTWludXNOdywgLWRpclNlTWludXNOdyk7XFxuXFxuICAgIHZlYzIgZGlyMSA9IG5vcm1hbGl6ZShkaXIueHkpO1xcbiAgICAvLyB0aGlzIGlzIHN1Ym9wdGltYWwuIEl0IHdvdWxkIHByb2JhYmx5IGJlIG1vcmUgZWZmaWNpZW50IHRvIGRvIHRoaXMgaW4gYW5vdGhlciBzdGFnZS5cXG4gICAgdmVjNCByZ2J5TjEgPSBnYW1tYUVuY29kZShzYXR1cmF0ZSh0ZXh0dXJlMkQoc2FtcGxlciwgdXYgLSBkaXIxICogZnhhYUNvbnNvbGVSY3BGcmFtZU9wdC56dykpKTtcXG4gICAgdmVjNCByZ2J5UDEgPSBnYW1tYUVuY29kZShzYXR1cmF0ZSh0ZXh0dXJlMkQoc2FtcGxlciwgdXYgKyBkaXIxICogZnhhYUNvbnNvbGVSY3BGcmFtZU9wdC56dykpKTtcXG5cXG4gICAgZmxvYXQgZGlyQWJzTWluVGltZXNDID0gbWluKGFicyhkaXIxLngpLCBhYnMoZGlyMS55KSkgKiBmeGFhQ29uc29sZUVkZ2VTaGFycG5lc3M7XFxuICAgIHZlYzIgZGlyMiA9IGNsYW1wKGRpcjEueHkgLyBkaXJBYnNNaW5UaW1lc0MsIC0yLjAsIDIuMCk7XFxuXFxuICAgIHZlYzQgcmdieU4yID0gZ2FtbWFFbmNvZGUoc2F0dXJhdGUodGV4dHVyZTJEKHNhbXBsZXIsIHV2IC0gZGlyMiAqIGZ4YWFDb25zb2xlUmNwRnJhbWVPcHQyLnp3KSkpO1xcbiAgICB2ZWM0IHJnYnlQMiA9IGdhbW1hRW5jb2RlKHNhdHVyYXRlKHRleHR1cmUyRChzYW1wbGVyLCB1diArIGRpcjIgKiBmeGFhQ29uc29sZVJjcEZyYW1lT3B0Mi56dykpKTtcXG5cXG4gICAgdmVjNCByZ2J5QSA9IHJnYnlOMSArIHJnYnlQMTtcXG4gICAgdmVjNCByZ2J5QiA9ICgocmdieU4yICsgcmdieVAyKSAqIDAuMjUpICsgKHJnYnlBICogMC4yNSk7XFxuXFxuICAgIGJvb2wgdHdvVGFwID0gKHJnYnlCLnkgPCBsdW1hTWluKSB8fCAocmdieUIueSA+IGx1bWFNYXgpO1xcblxcbiAgICBpZih0d29UYXApIHJnYnlCLnh5eiA9IHJnYnlBLnh5eiAqIDAuNTtcXG5cXG4gICAgcmV0dXJuIHJnYnlCO1xcbn1cXG5cIjtcbiIsIm1vZHVsZS5leHBvcnRzID0gXCJwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XFxuI2luY2x1ZGUgXFxcImNvbW1vbi5nbHNsXFxcIlxcbiNpbmNsdWRlIFxcXCJicmRmLmdsc2xcXFwiXFxuXFxudW5pZm9ybSBzYW1wbGVyMkQgdU5vcm1hbFNhbXBsZXI7XFxuXFxuI2lmZGVmIFVTRV9CQVNFX0NPTE9SX01BUFxcbnVuaWZvcm0gc2FtcGxlcjJEIHVCYXNlQ29sb3JTYW1wbGVyO1xcbiNlbmRpZlxcblxcbiNpZmRlZiBVU0VfTUFURVJJQUxfTUFQXFxudW5pZm9ybSBzYW1wbGVyMkQgdU1hdGVyaWFsU2FtcGxlcjtcXG4jZW5kaWZcXG5cXG51bmlmb3JtIHZlYzMgdUJhc2VDb2xvcjtcXG51bmlmb3JtIGZsb2F0IHVNZXRhbG5lc3M7XFxudW5pZm9ybSBmbG9hdCB1Um91Z2huZXNzO1xcblxcbiNpZmRlZiBJU19QT0lOVF9MSUdIVFxcbnVuaWZvcm0gdmVjMyB1TGlnaHRQb3NpdGlvbjtcXG4jZW5kaWZcXG5cXG4jaWZkZWYgVVNFX1NTU1xcbnVuaWZvcm0gZmxvYXQgdVN1YlN1cmZhY2VTY2F0dGVyaW5nO1xcbiNlbmRpZlxcblxcbiNpZmRlZiBJU19ESVJFQ1RJT05BTF9MSUdIVFxcbnVuaWZvcm0gdmVjMyB1TGlnaHREaXJlY3Rpb247XFxuI2VuZGlmXFxuXFxudW5pZm9ybSB2ZWMzIHVMaWdodENvbG9yO1xcbnVuaWZvcm0gZmxvYXQgdVZpZXdwb3J0QXNwZWN0O1xcbnVuaWZvcm0gZmxvYXQgdVNjYWxlO1xcblxcbnZhcnlpbmcgdmVjMiB2VXY7XFxudmFyeWluZyB2ZWMzIHZQb3NpdGlvbjtcXG5cXG4jaWZkZWYgVVNFX1NJTkdMRV9QQVNTXFxuI2luY2x1ZGUgXFxcImFtYmllbnQuZ2xzbFxcXCJcXG4jZW5kaWZcXG5cXG5jb25zdCB2ZWMzIGV5ZSA9IHZlYzMoMC41LCAwLjUsIDEwMC4wKTtcXG5cXG5mbG9hdCBhdHRlbnVhdGlvbihmbG9hdCBkaXN0YW5jZSl7XFxuICAgIHJldHVybiAgMS4wLyhkaXN0YW5jZSpkaXN0YW5jZSk7XFxufVxcblxcbnZlYzMgcmdiVG9Ob3JtYWwodmVjMyByZ2Ipe1xcbiAgICByZXR1cm4gbm9ybWFsaXplKHJnYiAtIHZlYzMoMC41KSk7XFxufVxcblxcbnZvaWQgbWFpbigpe1xcbiAgICB2ZWM0IG5vcm1hbFNhbXBsZSA9IHRleHR1cmUyRCh1Tm9ybWFsU2FtcGxlciwgdlV2KTtcXG4gICAgZmxvYXQgYWxwaGEgPSBub3JtYWxTYW1wbGUuYTtcXG4gICAgdmVjMyBub3JtYWwgPSByZ2JUb05vcm1hbChub3JtYWxTYW1wbGUucmdiKTtcXG4jaWZkZWYgVVNFX1NTU1xcbiAgICB2ZWM0IGRpZmZ1c2VOb3JtYWxTYW1wbGUgPSB0ZXh0dXJlMkQodU5vcm1hbFNhbXBsZXIsIHZVdiwgdVN1YlN1cmZhY2VTY2F0dGVyaW5nKTtcXG4gICAgdmVjMyBkaWZmdXNlTm9ybWFsID0gcmdiVG9Ob3JtYWwoZGlmZnVzZU5vcm1hbFNhbXBsZS5yZ2IpO1xcbiNlbHNlXFxuI2RlZmluZSBkaWZmdXNlTm9ybWFsIG5vcm1hbFxcbiNlbmRpZlxcblxcbiAgICBmbG9hdCBtZXRhbG5lc3MgPSB1TWV0YWxuZXNzO1xcbiAgICBmbG9hdCByb3VnaG5lc3MgPSB1Um91Z2huZXNzO1xcblxcbiNpZmRlZiBVU0VfTUFURVJJQUxfTUFQXFxuICAgIHZlYzQgbWF0ZXJpYWxTYW1wbGUgPSB0ZXh0dXJlMkQodU1hdGVyaWFsU2FtcGxlciwgdlV2KTtcXG4gICAgbWV0YWxuZXNzICo9IG1hdGVyaWFsU2FtcGxlLnI7XFxuICAgIHJvdWdobmVzcyAqPSBtYXRlcmlhbFNhbXBsZS5nO1xcbiAgICBmbG9hdCBvY2NsdXNpb24gPSBtYXRlcmlhbFNhbXBsZS5iO1xcbiNlbmRpZlxcblxcbiAgICBtZXRhbG5lc3MgPSBzYXR1cmF0ZShtZXRhbG5lc3MpO1xcbiAgICByb3VnaG5lc3MgPSBjbGFtcChyb3VnaG5lc3MsIEVQU0lMT04sIDEuMCk7XFxuXFxuICAgIHZlYzMgYmFzZUNvbG9yID0gdUJhc2VDb2xvcjtcXG5cXG4jaWZkZWYgVVNFX0JBU0VfQ09MT1JfTUFQXFxuICAgIHZlYzQgYmFzZUNvbG9yU2FtcGxlID0gdGV4dHVyZTJEKHVCYXNlQ29sb3JTYW1wbGVyLCB2VXYpO1xcbiAgICBiYXNlQ29sb3IgKj0gZ2FtbWFEZWNvZGUoYmFzZUNvbG9yU2FtcGxlLnJnYik7XFxuI2VuZGlmXFxuXFxuICAgIHZlYzMgZGlmZnVzZUNvbG9yID0gbWl4KGJhc2VDb2xvciwgdmVjMygwLjApLCBtZXRhbG5lc3MpO1xcbiAgICAvLyA/XFxuICAgIHZlYzMgc3BlY3VsYXJDb2xvciA9IG1peCh2ZWMzKDAuMDQpLCBiYXNlQ29sb3IucmdiLCBtZXRhbG5lc3MpKjAuNTtcXG5cXG4jaWZkZWYgSVNfUE9JTlRfTElHSFRcXG4gICAgdmVjMyBsaWdodE9mZnNldCA9IHZQb3NpdGlvbiAtIHVMaWdodFBvc2l0aW9uO1xcbiAgICBsaWdodE9mZnNldC55IC89IHVWaWV3cG9ydEFzcGVjdDtcXG4gICAgZmxvYXQgbGlnaHREaXN0YW5jZSA9IGxlbmd0aChsaWdodE9mZnNldCk7XFxuICAgIGZsb2F0IGZhbGxvZmYgPSBhdHRlbnVhdGlvbihsaWdodERpc3RhbmNlKTtcXG4gICAgdmVjMyBsaWdodERpcmVjdGlvbiA9IGxpZ2h0T2Zmc2V0L2xpZ2h0RGlzdGFuY2U7XFxuI2VuZGlmXFxuXFxuI2lmZGVmIElTX0RJUkVDVElPTkFMX0xJR0hUXFxuICAgIGZsb2F0IGZhbGxvZmYgPSAxLjA7XFxuICAgIHZlYzMgbGlnaHREaXJlY3Rpb24gPSB1TGlnaHREaXJlY3Rpb247XFxuI2VuZGlmXFxuXFxuICAgIHZlYzMgZXllRGlyZWN0aW9uID0gbm9ybWFsaXplKGV5ZSAtIHZQb3NpdGlvbik7XFxuICAgIHZlYzMgZGlmZnVzZSA9IG1heCgwLjAsIC1kb3QoZGlmZnVzZU5vcm1hbCwgbGlnaHREaXJlY3Rpb24pKSpkaWZmdXNlQ29sb3I7XFxuICAgIC8vIGxpbmVhciA9IHZlYzMocm91Z2huZXNzKTtcXG4gICAgdmVjMyBzcGVjdWxhciA9IGJyZGZfZ2d4KG5vcm1hbCwgLWxpZ2h0RGlyZWN0aW9uLCBleWVEaXJlY3Rpb24sIHNwZWN1bGFyQ29sb3IsIHJvdWdobmVzcyk7XFxuICAgIHZlYzMgaW50ZW5zaXR5ID0gKGRpZmZ1c2Urc3BlY3VsYXIpKmZhbGxvZmY7XFxuXFxuI2lmZGVmIFVTRV9NQVRFUklBTF9NQVBcXG4gICAgaW50ZW5zaXR5ICo9IG9jY2x1c2lvbjtcXG4jZW5kaWZcXG5cXG4gICAgdmVjMyBsaW5lYXIgPSB1TGlnaHRDb2xvcippbnRlbnNpdHk7XFxuICAgIC8vIGxpbmVhciA9IHNwZWN1bGFyQ29sb3I7XFxuICAgIC8vIGxpbmVhci5yID0gbWV0YWxuZXNzO1xcbiAgICAvLyBsaW5lYXIgPSB2ZWMzKHVSb3VnaG5lc3MqbWF0ZXJpYWxTYW1wbGUuZyA9PSBtYXRlcmlhbFNhbXBsZS5nID8gMS4wIDogMC4wKTtcXG4gICAgLy8gbGluZWFyLmIgPSBvY2NsdXNpb247XFxuXFxuICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQobGluZWFyLCBhbHBoYSk7XFxuXFxuI2lmZGVmIFVTRV9TSU5HTEVfUEFTU1xcbiAgICBnbF9GcmFnQ29sb3IgPSBnYW1tYUVuY29kZShnbF9GcmFnQ29sb3IpO1xcbiNpZmRlZiBVU0VfQU1CSUVOVF9NQVBcXG4gICBhZGRBbWJpZW50KGdsX0ZyYWdDb2xvcik7XFxuI2VuZGlmXFxuI2VuZGlmXFxuXFxufVxcblwiO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBcInByZWNpc2lvbiBoaWdocCBmbG9hdDtcXG4jaW5jbHVkZSBcXFwiY29tbW9uLmdsc2xcXFwiXFxuI2luY2x1ZGUgXFxcImZ4YWEuZ2xzbFxcXCJcXG5cXG51bmlmb3JtIHNhbXBsZXIyRCB1RnJhbWVCdWZmZXJTYW1wbGVyO1xcbnVuaWZvcm0gdmVjMiB1RnJhbWVCdWZmZXJSZXNvbHV0aW9uO1xcblxcbnZhcnlpbmcgdmVjMyB2UG9zaXRpb247XFxuXFxuI2lmZGVmIFVTRV9BTUJJRU5UX01BUFxcbnZhcnlpbmcgdmVjMiB2VXY7XFxuI2VuZGlmXFxuXFxuI2luY2x1ZGUgXFxcImFtYmllbnQuZ2xzbFxcXCJcXG5cXG52b2lkIG1haW4oKXtcXG4jaWZkZWYgVVNFX0ZYQUFcXG4gICAgLy8gZnhhYSBkb2VzIGdhbW1hRW5jb2RlIC4uIGZvciBub3dcXG4gICAgdmVjNCBmcmFtZUJ1ZmZlciA9IGZ4YWEodmVjMih2UG9zaXRpb24ueCwgMS4wIC0gdlBvc2l0aW9uLnkpLCB1RnJhbWVCdWZmZXJSZXNvbHV0aW9uLCB1RnJhbWVCdWZmZXJTYW1wbGVyKTtcXG4jZW5kaWZcXG4jaWZuZGVmIFVTRV9GWEFBXFxuICAgIHZlYzQgZnJhbWVCdWZmZXIgPSBnYW1tYUVuY29kZSh0ZXh0dXJlMkQodUZyYW1lQnVmZmVyU2FtcGxlciwgdmVjMih2UG9zaXRpb24ueCwgMS4wIC0gdlBvc2l0aW9uLnkpKSk7XFxuI2VuZGlmXFxuICAgIGdsX0ZyYWdDb2xvciA9IGZyYW1lQnVmZmVyO1xcbi8vIGFzc3VtZSBTUkdCXFxuI2lmZGVmIFVTRV9BTUJJRU5UX01BUFxcbiAgIGFkZEFtYmllbnQoZ2xfRnJhZ0NvbG9yKTtcXG4jZW5kaWZcXG59XFxuXCI7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFwiYXR0cmlidXRlIHZlYzMgYVBvc2l0aW9uO1xcbiNpZmRlZiBVU0VfQU1CSUVOVF9NQVBcXG52YXJ5aW5nIHZlYzIgdlV2O1xcbiNlbmRpZlxcblxcbnZvaWQgbWFpbigpe1xcbiAgICB2VXYgPSB2ZWMyKDAuNSktKGFQb3NpdGlvbi54eSkqdmVjMigtMC41LCAwLjUpO1xcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoYVBvc2l0aW9uLCAxLjApO1xcbn1cXG5cIjtcbiIsIm1vZHVsZS5leHBvcnRzID0gXCJhdHRyaWJ1dGUgdmVjMyBhUG9zaXRpb247XFxuXFxudW5pZm9ybSBmbG9hdCB1U2NhbGU7XFxudW5pZm9ybSBmbG9hdCB1VGV4dHVyZUFzcGVjdDtcXG5cXG52YXJ5aW5nIHZlYzIgdlV2O1xcbnZhcnlpbmcgdmVjMyB2UG9zaXRpb247XFxuXFxudm9pZCBtYWluKCl7XFxuICAgIHZQb3NpdGlvbiA9IHZlYzModmVjMigwLjUpLShhUG9zaXRpb24ueHkpKnZlYzIoLTAuNSwgMC41KSwgMCk7XFxuICAgIHZVdiA9IHZQb3NpdGlvbi54eSAqIHVTY2FsZSAqIHZlYzIoMS4wLCAxLjAvdVRleHR1cmVBc3BlY3QpO1xcbiAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoYVBvc2l0aW9uLCAxLjApO1xcbn1cXG5cIjtcbiJdfQ==
