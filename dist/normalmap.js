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
            fbo = new FBO(gl, undefined, undefined, gl.UNSIGNED_BYTE, extSRGB.SRGB_ALPHA_EXT);
            if(fbo.supported) {
                fboFormat = extSRGB.SRGB_ALPHA_EXT;
                return fbo;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZmJvLmpzIiwic3JjL25vcm1hbG1hcC5qcyIsInNyYy9zaGFkZXItbWFuYWdlci5qcyIsInNyYy9zaGFkZXIuanMiLCJzcmMvc2hhZGVycy9hbWJpZW50Lmdsc2wiLCJzcmMvc2hhZGVycy9icmRmLmdsc2wiLCJzcmMvc2hhZGVycy9jb21tb24uZ2xzbCIsInNyYy9zaGFkZXJzL2Z4YWEuZ2xzbCIsInNyYy9zaGFkZXJzL2xpZ2h0LWZyYWdtZW50Lmdsc2wiLCJzcmMvc2hhZGVycy9yZW5kZXItZnJhZ21lbnQuZ2xzbCIsInNyYy9zaGFkZXJzL3JlbmRlci12ZXJ0ZXguZ2xzbCIsInNyYy9zaGFkZXJzL3ZlcnRleC5nbHNsIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakxBO0FBQ0E7O0FDREE7QUFDQTs7QUNEQTtBQUNBOztBQ0RBO0FBQ0E7O0FDREE7QUFDQTs7QUNEQTtBQUNBOztBQ0RBO0FBQ0E7O0FDREE7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJmdW5jdGlvbiBGQk8oZ2wsIHdpZHRoLCBoZWlnaHQsIHR5cGUsIGZvcm1hdCwgZGVwdGgpe1xuICAgIHdpZHRoID0gd2lkdGggfHwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoO1xuICAgIGhlaWdodCA9IGhlaWdodCB8fCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0O1xuICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB0aGlzLmdsID0gZ2w7XG5cbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIHRoaXMuZnJhbWVidWZmZXIpO1xuXG4gICAgdGhpcy50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpO1xuICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRoaXMudGV4dHVyZSk7XG4gICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCBmb3JtYXQgfHwgZ2wuUkdCQSwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0IHx8IGdsLlJHQkEsIHR5cGUgfHwgZ2wuVU5TSUdORURfQllURSwgbnVsbCk7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01BR19GSUxURVIsIGdsLkxJTkVBUik7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUik7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfUywgZ2wuQ0xBTVBfVE9fRURHRSk7XG4gICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSk7XG5cbiAgICBpZihkZXB0aCl7XG4gICAgICAgIHRoaXMuZGVwdGggPSBnbC5jcmVhdGVSZW5kZXJidWZmZXIoKTtcbiAgICAgICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihnbC5SRU5ERVJCVUZGRVIsIHRoaXMuZGVwdGgpO1xuICAgICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKGdsLlJFTkRFUkJVRkZFUiwgZ2wuREVQVEhfQ09NUE9ORU5UMTYsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZ2wuREVQVEhfQVRUQUNITUVOVCwgZ2wuUkVOREVSQlVGRkVSLCB0aGlzLmRlcHRoKTtcbiAgICB9XG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGdsLkNPTE9SX0FUVEFDSE1FTlQwLCBnbC5URVhUVVJFXzJELCB0aGlzLnRleHR1cmUsIDApO1xuXG4gICAgdGhpcy5zdXBwb3J0ZWQgPSBnbC5jaGVja0ZyYW1lYnVmZmVyU3RhdHVzKGdsLkZSQU1FQlVGRkVSKSA9PT0gZ2wuRlJBTUVCVUZGRVJfQ09NUExFVEU7XG5cbiAgICBnbC52aWV3cG9ydCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBudWxsKTtcbiAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKGdsLlJFTkRFUkJVRkZFUiwgbnVsbCk7XG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBudWxsKTtcbn1cbkZCTy5wcm90b3R5cGUgPSB7XG4gICAgYmluZDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmdsLmJpbmRGcmFtZWJ1ZmZlcih0aGlzLmdsLkZSQU1FQlVGRkVSLCB0aGlzLmZyYW1lYnVmZmVyKTtcbiAgICB9LFxuICAgIHVuYmluZDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuZ2wuYmluZEZyYW1lYnVmZmVyKHRoaXMuZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xuICAgIH1cbn07XG5tb2R1bGUuZXhwb3J0cyA9IEZCTztcbiIsIlxudmFyIHNoYWRlclNvdXJjZXMgPSAoe1wic2hhZGVyc1wiOih7XCJhbWJpZW50XCI6cmVxdWlyZShcIi4vc2hhZGVycy9hbWJpZW50Lmdsc2xcIiksXCJicmRmXCI6cmVxdWlyZShcIi4vc2hhZGVycy9icmRmLmdsc2xcIiksXCJjb21tb25cIjpyZXF1aXJlKFwiLi9zaGFkZXJzL2NvbW1vbi5nbHNsXCIpLFwiZnhhYVwiOnJlcXVpcmUoXCIuL3NoYWRlcnMvZnhhYS5nbHNsXCIpLFwibGlnaHQtZnJhZ21lbnRcIjpyZXF1aXJlKFwiLi9zaGFkZXJzL2xpZ2h0LWZyYWdtZW50Lmdsc2xcIiksXCJyZW5kZXItZnJhZ21lbnRcIjpyZXF1aXJlKFwiLi9zaGFkZXJzL3JlbmRlci1mcmFnbWVudC5nbHNsXCIpLFwicmVuZGVyLXZlcnRleFwiOnJlcXVpcmUoXCIuL3NoYWRlcnMvcmVuZGVyLXZlcnRleC5nbHNsXCIpLFwidmVydGV4XCI6cmVxdWlyZShcIi4vc2hhZGVycy92ZXJ0ZXguZ2xzbFwiKX0pfSkuc2hhZGVycztcbnZhciBTaGFkZXJNYW5hZ2VyID0gcmVxdWlyZSgnLi9zaGFkZXItbWFuYWdlcicpO1xudmFyIEZCTyA9IHJlcXVpcmUoJy4vZmJvJyk7XG5cbmNvbnN0IE5PUk1BTF9TQU1QTEVSID0gMDtcbmNvbnN0IEJBU0VfQ09MT1JfU0FNUExFUiA9IDE7XG5jb25zdCBNQVRFUklBTF9TQU1QTEVSID0gMjtcbmNvbnN0IEFNQklFTlRfU0FNUExFUiA9IDM7XG5jb25zdCBGUkFNRUJVRkZFUl9TQU1QTEVSID0gNDtcblxudmFyIElNTVVUQUJMRV9QUk9QRVJUSUVTID0gJ2NhbnZhcyByZXBlYXQgc2luZ2xlUGFzcycuc3BsaXQoKTtcblxuZnVuY3Rpb24gbm9ybWFsbWFwKG9wdGlvbnMpe1xuICAgIG9wdGlvbnMgPSBhc3NpZ24oe1xuICAgICAgICBtZXRhbG5lc3M6IDEsXG4gICAgICAgIHJvdWdobmVzczogMSxcbiAgICAgICAgYW1iaWVudDogMSxcbiAgICAgICAgYmFzZUNvbG9yOiBuZXcgRmxvYXQzMkFycmF5KFswLjUsIDAuNSwgMC41XSlcbiAgICB9LCBvcHRpb25zKTtcbiAgICB2YXIgY2FudmFzID0gb3B0aW9ucy5jYW52YXM7XG5cbiAgICBpZihjYW52YXMgPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKCdub3JtYWxtYXAoKSBjYW52YXMgaXMgcmVxdWlyZWQnKTtcblxuICAgIGlmKG9wdGlvbnMubm9ybWFsTWFwID09IG51bGwpIHRocm93IG5ldyBFcnJvcignbm9ybWFsbWFwKCkgbm9ybWFsTWFwIGlzIHJlcXVpcmVkJyk7XG5cbiAgICB2YXIgZGVmaW5lcyA9IHt9O1xuICAgIGRlZmluZURlZmluZXMoZGVmaW5lcywgb3B0aW9ucyk7XG5cbiAgICB2YXIgbm9ybWFsTWFwV2lkdGggPSBvcHRpb25zLm5vcm1hbE1hcC5uYXR1cmFsV2lkdGggfHwgb3B0aW9ucy5ub3JtYWxNYXAud2lkdGg7XG4gICAgdmFyIG5vcm1hbE1hcEhlaWdodCA9IG9wdGlvbnMubm9ybWFsTWFwLm5hdHVyYWxIZWlnaHQgfHwgb3B0aW9ucy5ub3JtYWxNYXAuaGVpZ2h0O1xuXG4gICAgdmFyIHRleHR1cmVBc3BlY3QgPSBub3JtYWxNYXBXaWR0aCAvIG5vcm1hbE1hcEhlaWdodDtcbiAgICB2YXIgdmlld3BvcnRBc3BlY3QsIHNjYWxlO1xuXG4gICAgZnVuY3Rpb24gcmVzaXplKCl7XG4gICAgICAgIHZpZXdwb3J0QXNwZWN0ID0gY2FudmFzLndpZHRoIC8gY2FudmFzLmhlaWdodDtcbiAgICAgICAgc2NhbGUgPSBvcHRpb25zLnJlcGVhdCA/IChjYW52YXMud2lkdGggLyBub3JtYWxNYXBXaWR0aCkgOiAxO1xuICAgICAgICBpZihnbCkge1xuICAgICAgICAgICAgaWYoKCFvcHRpb25zLnNpbmdsZVBhc3MpKXtcbiAgICAgICAgICAgICAgICBmYm8udW5iaW5kKCk7XG4gICAgICAgICAgICAgICAgZmJvID0gZ2V0RkJPKGdsKTtcbiAgICAgICAgICAgICAgICBmYm8uYmluZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ2wudmlld3BvcnQoMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlc2l6ZSgpO1xuXG4gICAgLy8gdGhlc2UgbmVlZCB0byBiZSByZXNldCBvbiBnbCByZWluaXRpYWxpemF0aW9uc1xuICAgIHZhciBzaGFkZXJNYW5hZ2VyO1xuICAgIHZhciBwb2ludExpZ2h0U2hhZGVyLCBkaXJlY3Rpb25hbExpZ2h0U2hhZGVyLCByZW5kZXJTaGFkZXI7XG4gICAgdmFyIHNjcmVlblF1YWQsIGZibztcbiAgICB2YXIgZ2w7XG5cbiAgICBmdW5jdGlvbiBpbml0R2woKXtcbiAgICAgICAgdmFyIGdsT3B0aW9ucyA9IHtcbiAgICAgICAgICAgIC8vIGZhbHNlIGlzIG5vdCBzdXBwb3J0ZWQgYnkgaU9TXG4gICAgICAgICAgICBwcmVtdWx0aXBsaWVkQWxwaGE6IHRydWUsXG4gICAgICAgICAgICBhbHBoYTogdHJ1ZSxcbiAgICAgICAgICAgIGRlcHRoOiBmYWxzZVxuICAgICAgICB9O1xuXG4gICAgICAgIGdsID0gY2FudmFzLmdldENvbnRleHQoJ3dlYmdsJywgZ2xPcHRpb25zKSB8fCBjYW52YXMuZ2V0Q29udGV4dCgnZXhwZXJpbWVudGFsLXdlYmdsJywgZ2xPcHRpb25zKTtcblxuICAgICAgICBpZighZ2wpe1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCd3ZWJnbCBub3Qgc3VwcG9ydGVkIScpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2wuYmxlbmRDb2xvcigwLCAwLCAwLCAwKTtcbiAgICAgICAgZ2wuY2xlYXJDb2xvcigwLCAwLCAwLCAwKTtcbiAgICAgICAgc2NyZWVuUXVhZCA9IGdldFNjcmVlblF1YWRCdWZmZXIoZ2wpO1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgwKTtcbiAgICAgICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHNjcmVlblF1YWQpO1xuICAgICAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKDAsIDMsIGdsLkZMT0FULCBmYWxzZSwgMCwgMCk7XG5cbiAgICAgICAgZ2wuZW5hYmxlKGdsLkJMRU5EKTtcbiAgICAgICAgZ2wuZW5hYmxlKGdsLkRJVEhFUik7XG4gICAgICAgIGdsLmRpc2FibGUoZ2wuREVQVEhfVEVTVCk7XG5cbiAgICAgICAgZ2wuYmxlbmRGdW5jU2VwYXJhdGUoZ2wuU1JDX0FMUEhBLCBnbC5PTkUsIGdsLk9ORSwgZ2wuWkVSTyk7XG5cbiAgICAgICAgc2hhZGVyTWFuYWdlciA9IG5ldyBTaGFkZXJNYW5hZ2VyKGdsLCBzaGFkZXJTb3VyY2VzKTtcbiAgICAgICAgaWYoIW9wdGlvbnMuc2luZ2xlUGFzcyl7XG4gICAgICAgICAgICBmYm9UeXBlID0gbnVsbDtcbiAgICAgICAgICAgIGZibyA9IGdldEZCTyhnbCk7XG4gICAgICAgICAgICBmYm8uYmluZCgpO1xuICAgICAgICB9XG4gICAgICAgIGdsLnZpZXdwb3J0KDAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodCk7XG5cbiAgICAgICAgY29uZmlndXJlR2woKTtcbiAgICAgICAgd2luZG93LmdsID0gZ2w7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29uZmlndXJlR2woKXtcbiAgICAgICAgc2V0dXBUZXh0dXJlcyhnbCwgb3B0aW9ucyk7XG4gICAgICAgIGJ1aWxkU2hhZGVycygpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJ1aWxkU2hhZGVyKG5hbWUsIGFkZGl0aW9uYWxEZWZpbmVzKXtcbiAgICAgICAgcmV0dXJuIHNoYWRlck1hbmFnZXIuZ2V0KCd2ZXJ0ZXgnLCBuYW1lICsgJy1mcmFnbWVudCcsXG4gICAgICAgICAgICBhc3NpZ24oYWRkaXRpb25hbERlZmluZXN8fHt9LCBkZWZpbmVzKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnVpbGRTaGFkZXJzKCl7XG4gICAgICAgIGRlZmluZURlZmluZXMoZGVmaW5lcywgb3B0aW9ucyk7XG4gICAgICAgIHBvaW50TGlnaHRTaGFkZXIgPSBidWlsZFNoYWRlcignbGlnaHQnLCB7SVNfUE9JTlRfTElHSFQ6IDF9KTtcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodFNoYWRlciA9IGJ1aWxkU2hhZGVyKCdsaWdodCcsIHtJU19ESVJFQ1RJT05BTF9MSUdIVDogMX0pO1xuICAgICAgICByZW5kZXJTaGFkZXIgPSBidWlsZFNoYWRlcigncmVuZGVyJyk7XG4gICAgfVxuXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ3ZWJnbGNvbnRleHRsb3N0XCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgZ2wgPSBudWxsO1xuICAgICAgICBjb25zb2xlLndhcm4oJ2xvc3Qgd2ViZ2wgY29udGV4dCEnKTtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH0sIGZhbHNlKTtcblxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwid2ViZ2xjb250ZXh0cmVzdG9yZWRcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgY29uc29sZS53YXJuKCd3ZWJnbCBjb250ZXh0IHJlc3RvcmVkIScpO1xuICAgICAgICBpbml0R2woKTtcbiAgICAgICAgaWYob3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCkge1xuICAgICAgICAgICAgb3B0aW9ucy5vbkNvbnRleHRSZXN0b3JlZCgpO1xuICAgICAgICB9XG5cbiAgICB9LCBmYWxzZSk7XG5cbiAgICBpbml0R2woKTtcblxuICAgIGZ1bmN0aW9uIGdldEdlbmVyaWNVbmlmb3Jtcygpe1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdVRleHR1cmVBc3BlY3Q6IG9wdGlvbnMucmVwZWF0ID8gdmlld3BvcnRBc3BlY3QqdGV4dHVyZUFzcGVjdCA6IDEsXG4gICAgICAgICAgICB1U2NhbGU6IHNjYWxlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0R2VuZXJpY0xpZ2h0VW5pZm9ybXMoY29sb3Ipe1xuICAgICAgICB2YXIgdW5pZm9ybXMgPSBhc3NpZ24oZ2V0R2VuZXJpY1VuaWZvcm1zKCksIHtcbiAgICAgICAgICAgIHVMaWdodENvbG9yOiBjb2xvcixcbiAgICAgICAgICAgIHVNZXRhbG5lc3M6IG9wdGlvbnMubWV0YWxuZXNzLFxuICAgICAgICAgICAgdVJvdWdobmVzczogb3B0aW9ucy5yb3VnaG5lc3MsXG4gICAgICAgICAgICB1QmFzZUNvbG9yOiBvcHRpb25zLmJhc2VDb2xvcixcbiAgICAgICAgICAgIHVOb3JtYWxTYW1wbGVyOiBOT1JNQUxfU0FNUExFUlxuICAgICAgICB9KTtcbiAgICAgICAgaWYob3B0aW9ucy5iYXNlQ29sb3JNYXApIHtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVCYXNlQ29sb3JTYW1wbGVyID0gQkFTRV9DT0xPUl9TQU1QTEVSO1xuICAgICAgICB9XG4gICAgICAgIGlmKG9wdGlvbnMubWF0ZXJpYWxNYXApIHtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVNYXRlcmlhbFNhbXBsZXIgPSBNQVRFUklBTF9TQU1QTEVSO1xuICAgICAgICB9XG4gICAgICAgIGlmKG9wdGlvbnMuc3ViU3VyZmFjZVNjYXR0ZXJpbmcpe1xuICAgICAgICAgICAgdW5pZm9ybXMudVN1YlN1cmZhY2VTY2F0dGVyaW5nID0gb3B0aW9ucy5zdWJTdXJmYWNlU2NhdHRlcmluZztcbiAgICAgICAgfVxuICAgICAgICBpZihvcHRpb25zLnNpbmdsZVBhc3MgJiYgb3B0aW9ucy5hbWJpZW50TWFwKXtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVBbWJpZW50U2FtcGxlciA9IEFNQklFTlRfU0FNUExFUjtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVBbWJpZW50ID0gb3B0aW9ucy5hbWJpZW50O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmlmb3JtcztcbiAgICB9XG5cbiAgICB2YXIgZmJvVHlwZSA9IG51bGw7XG4gICAgdmFyIGZib0Zvcm1hdDtcbiAgICBmdW5jdGlvbiBnZXRGQk8oZ2wpe1xuICAgICAgICB2YXIgZmJvO1xuICAgICAgICBpZihmYm9UeXBlKSByZXR1cm4gbmV3IEZCTyhnbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZib1R5cGUsIGZib0Zvcm1hdCk7XG4gICAgICAgIHZhciBoYWxmRmxvYXQgPSBnbC5nZXRFeHRlbnNpb24oJ09FU190ZXh0dXJlX2hhbGZfZmxvYXQnKTtcbiAgICAgICAgdmFyIGhhbGZGbG9hdExpbmVhciA9IGdsLmdldEV4dGVuc2lvbignT0VTX3RleHR1cmVfaGFsZl9mbG9hdF9saW5lYXInKTtcbiAgICAgICAgaWYoaGFsZkZsb2F0ICYmIGhhbGZGbG9hdExpbmVhciAmJiB0cnVlKXtcbiAgICAgICAgICAgIGZibyA9IG5ldyBGQk8oZ2wsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBoYWxmRmxvYXQuSEFMRl9GTE9BVF9PRVMpO1xuICAgICAgICAgICAgaWYoZmJvLnN1cHBvcnRlZCl7XG4gICAgICAgICAgICAgICAgZmJvVHlwZSA9IGhhbGZGbG9hdC5IQUxGX0ZMT0FUX09FUztcbiAgICAgICAgICAgICAgICByZXR1cm4gZmJvO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHZhciBmbG9hdCA9IGdsLmdldEV4dGVuc2lvbignT0VTX3RleHR1cmVfZmxvYXQnKTtcbiAgICAgICAgdmFyIGZsb2F0TGluZWFyID0gZ2wuZ2V0RXh0ZW5zaW9uKCdPRVNfdGV4dHVyZV9mbG9hdF9saW5lYXInKTtcbiAgICAgICAgaWYoZmxvYXQgJiYgZmxvYXRMaW5lYXIgJiYgZmFsc2Upe1xuICAgICAgICAgICAgZmJvID0gbmV3IEZCTyhnbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGdsLkZMT0FUKTtcbiAgICAgICAgICAgIGlmKGZiby5zdXBwb3J0ZWQpIHtcbiAgICAgICAgICAgICAgICBmYm9UeXBlID0gZ2wuRkxPQVQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZibztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmYm9UeXBlID0gZ2wuVU5TSUdORURfQllURTtcbiAgICAgICAgdmFyIGV4dFNSR0IgPSBnbC5nZXRFeHRlbnNpb24oJ0VYVF9zUkdCJyk7XG4gICAgICAgIGlmKGV4dFNSR0Ipe1xuICAgICAgICAgICAgZmJvID0gbmV3IEZCTyhnbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGdsLlVOU0lHTkVEX0JZVEUsIGV4dFNSR0IuU1JHQl9BTFBIQV9FWFQpO1xuICAgICAgICAgICAgaWYoZmJvLnN1cHBvcnRlZCkge1xuICAgICAgICAgICAgICAgIGZib0Zvcm1hdCA9IGV4dFNSR0IuU1JHQl9BTFBIQV9FWFQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZibztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IEZCTyhnbCk7XG4gICAgfVxuXG4gICAgdmFyIGxpZ2h0cyA9IHtcbiAgICAgICAgY2FudmFzOiBjYW52YXMsXG4gICAgICAgIGFkZFBvaW50TGlnaHQ6IGZ1bmN0aW9uKHBvc2l0aW9uLCBjb2xvcil7XG4gICAgICAgICAgICBpZighZ2wpIHJldHVybjtcbiAgICAgICAgICAgIGlmKG9wdGlvbnMuc2luZ2xlUGFzcyl7XG4gICAgICAgICAgICAgICAgZ2wuY2xlYXIoZ2wuQ09MT1JfQlVGRkVSX0JJVCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwb2ludExpZ2h0U2hhZGVyLnVzZSgpO1xuICAgICAgICAgICAgdmFyIHVuaWZvcm1zID0gZ2V0R2VuZXJpY0xpZ2h0VW5pZm9ybXMoY29sb3IpO1xuICAgICAgICAgICAgdW5pZm9ybXMudUxpZ2h0UG9zaXRpb24gPSBwb3NpdGlvbjtcbiAgICAgICAgICAgIHVuaWZvcm1zLnVWaWV3cG9ydEFzcGVjdCA9IHZpZXdwb3J0QXNwZWN0O1xuICAgICAgICAgICAgcG9pbnRMaWdodFNoYWRlci51bmlmb3Jtcyh1bmlmb3Jtcyk7XG4gICAgICAgICAgICBkcmF3QnVmZmVyKGdsKTtcbiAgICAgICAgfSxcbiAgICAgICAgYWRkRGlyZWN0aW9uYWxMaWdodDogZnVuY3Rpb24oZGlyZWN0aW9uLCBjb2xvcil7XG4gICAgICAgICAgICBpZighZ2wpIHJldHVybjtcbiAgICAgICAgICAgIGlmKG9wdGlvbnMuc2luZ2xlUGFzcyl7XG4gICAgICAgICAgICAgICAgZ2wuY2xlYXIoZ2wuQ09MT1JfQlVGRkVSX0JJVCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkaXJlY3Rpb25hbExpZ2h0U2hhZGVyLnVzZSgpO1xuICAgICAgICAgICAgdmFyIHVuaWZvcm1zID0gZ2V0R2VuZXJpY0xpZ2h0VW5pZm9ybXMoY29sb3IpO1xuICAgICAgICAgICAgdW5pZm9ybXMudUxpZ2h0RGlyZWN0aW9uID0gZGlyZWN0aW9uO1xuICAgICAgICAgICAgZGlyZWN0aW9uYWxMaWdodFNoYWRlci51bmlmb3Jtcyh1bmlmb3Jtcyk7XG4gICAgICAgICAgICBkcmF3QnVmZmVyKGdsKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYoIWdsKSByZXR1cm47XG4gICAgICAgICAgICBpZihvcHRpb25zLnNpbmdsZVBhc3MpIHJldHVybjtcbiAgICAgICAgICAgIGZiby51bmJpbmQoKTtcbiAgICAgICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyBGUkFNRUJVRkZFUl9TQU1QTEVSKTtcbiAgICAgICAgICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGZiby50ZXh0dXJlKTtcblxuICAgICAgICAgICAgcmVuZGVyU2hhZGVyLnVzZSgpO1xuICAgICAgICAgICAgdmFyIHVuaWZvcm1zID0ge1xuICAgICAgICAgICAgICAgIHVGcmFtZUJ1ZmZlclNhbXBsZXI6IEZSQU1FQlVGRkVSX1NBTVBMRVJcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmKG9wdGlvbnMuYW50aUFsaWFzaW5nKSB7XG4gICAgICAgICAgICAgICAgdW5pZm9ybXMudUZyYW1lQnVmZmVyUmVzb2x1dGlvbiA9IG5ldyBGbG9hdDMyQXJyYXkoW2Ziby53aWR0aCwgZmJvLmhlaWdodF0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihvcHRpb25zLmFtYmllbnRNYXApe1xuICAgICAgICAgICAgICAgIGFzc2lnbih1bmlmb3JtcywgZ2V0R2VuZXJpY1VuaWZvcm1zKCkpO1xuICAgICAgICAgICAgICAgIHVuaWZvcm1zLnVBbWJpZW50U2FtcGxlciA9IEFNQklFTlRfU0FNUExFUjtcbiAgICAgICAgICAgICAgICB1bmlmb3Jtcy51QW1iaWVudCA9IG9wdGlvbnMuYW1iaWVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVuZGVyU2hhZGVyLnVuaWZvcm1zKHVuaWZvcm1zKTtcbiAgICAgICAgICAgIGdsLmNsZWFyKGdsLkNPTE9SX0JVRkZFUl9CSVQpO1xuICAgICAgICAgICAgZHJhd0J1ZmZlcihnbCk7XG4gICAgICAgICAgICBmYm8uYmluZCgpO1xuICAgICAgICAgICAgZ2wuY2xlYXIoZ2wuQ09MT1JfQlVGRkVSX0JJVCk7XG4gICAgICAgIH0sXG4gICAgICAgIGNvbmZpZ3VyZTogZnVuY3Rpb24oY2hhbmdlcyl7XG4gICAgICAgICAgICBJTU1VVEFCTEVfUFJPUEVSVElFUy5mb3JFYWNoKGZ1bmN0aW9uKHByb3Ape1xuICAgICAgICAgICAgICAgIGlmKHByb3AgaW4gY2hhbmdlcykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiY2FuJ3QgY29uZmlndXJlKClcIiArIHByb3ApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYXNzaWduKG9wdGlvbnMsIGNoYW5nZXMpO1xuICAgICAgICAgICAgaWYoZ2wpIGNvbmZpZ3VyZUdsKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlc2l6ZTogcmVzaXplXG4gICAgfTtcblxuICAgIHJldHVybiBsaWdodHM7XG59XG5tb2R1bGUuZXhwb3J0cyA9IG5vcm1hbG1hcDtcblxuZnVuY3Rpb24gZGVmaW5lRGVmaW5lcyhkZWZpbmVzLCBvcHRpb25zKXtcbiAgICBkZWZpbmVzLlVTRV9CQVNFX0NPTE9SX01BUCA9IG9wdGlvbnMuYmFzZUNvbG9yTWFwICYmIDE7XG4gICAgZGVmaW5lcy5VU0VfTUFURVJJQUxfTUFQID0gb3B0aW9ucy5tYXRlcmlhbE1hcCAmJiAxO1xuICAgIGRlZmluZXMuVVNFX0FNQklFTlRfTUFQID0gb3B0aW9ucy5hbWJpZW50TWFwICYmIDE7XG4gICAgZGVmaW5lcy5VU0VfU1NTID0gb3B0aW9ucy5zdWJTdXJmYWNlU2NhdHRlcmluZyAmJiAxO1xuICAgIGRlZmluZXMuVVNFX0ZYQUEgPSBvcHRpb25zLmFudGlBbGlhc2luZyA/IDEgOiB1bmRlZmluZWQ7XG4gICAgZGVmaW5lcy5VU0VfU0lOR0xFX1BBU1MgPSBvcHRpb25zLnNpbmdsZVBhc3MgPyAxIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRTY3JlZW5RdWFkQnVmZmVyKGdsKXtcbiAgICB2YXIgYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKCk7XG4gICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIGJ1ZmZlcik7XG4gICAgdmFyIHZlcnRpY2VzID0gbmV3IEZsb2F0MzJBcnJheShbXG4gICAgICAgIDEuMCwgIDEuMCwgIDAuMCxcbiAgICAgICAgLTEuMCwgMS4wLCAgMC4wLFxuICAgICAgICAxLjAsICAtMS4wLCAwLjAsXG4gICAgICAgIC0xLjAsIC0xLjAsIDAuMFxuICAgIF0pO1xuICAgIGdsLmJ1ZmZlckRhdGEoZ2wuQVJSQVlfQlVGRkVSLCB2ZXJ0aWNlcywgZ2wuU1RBVElDX0RSQVcpO1xuICAgIHJldHVybiBidWZmZXI7XG59XG5cbmZ1bmN0aW9uIGltYWdlVG9UZXh0dXJlKGdsLCBpbWFnZSwgdHlwZSwgcmVwZWF0KXtcbiAgICB2YXIgdGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKTtcbiAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0ZXh0dXJlKTtcblxuICAgIGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19GTElQX1lfV0VCR0wsIGZhbHNlKTtcbiAgICBnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIGZhbHNlKTtcbiAgICBnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBnbC5OT05FKTtcblxuICAgIHZhciBpc1BvdCA9IGlzSW1hZ2VQb3dlck9mVHdvKGltYWdlKTtcbiAgICBnbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIHR5cGUgfHwgZ2wuUkdCQSwgdHlwZSB8fCBnbC5SR0JBLCBnbC5VTlNJR05FRF9CWVRFLCBpbWFnZSk7XG4gICAgaWYoaXNQb3Qpe1xuICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgZ2wuTElORUFSKTtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUl9NSVBNQVBfTElORUFSKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5MSU5FQVIpO1xuICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUlOX0ZJTFRFUiwgZ2wuTElORUFSKTtcbiAgICB9XG4gICAgaWYocmVwZWF0ICYmIGlzUG90KXtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfUywgZ2wuUkVQRUFUKTtcbiAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuUkVQRUFUKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1MsIGdsLkNMQU1QX1RPX0VER0UpO1xuICAgICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9ULCBnbC5DTEFNUF9UT19FREdFKTtcbiAgICB9XG4gICAgaWYoaXNQb3Qpe1xuICAgICAgICBnbC5nZW5lcmF0ZU1pcG1hcChnbC5URVhUVVJFXzJEKTtcbiAgICB9XG4gICAgLy8gZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgbnVsbCk7XG4gICAgcmV0dXJuIHRleHR1cmU7XG59XG5cbmZ1bmN0aW9uIHNldHVwVGV4dHVyZXMoZ2wsIG9wdGlvbnMpe1xuICAgIGlmKG9wdGlvbnMubm9ybWFsTWFwID09IG51bGwpIHRocm93IG5ldyBFcnJvcignbm9ybWFsbWFwKCkgbm9ybWFsTWFwIGF0dHJpYnV0ZSBpcyByZXF1aXJlZCcpO1xuXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCArIE5PUk1BTF9TQU1QTEVSKTtcbiAgICBpbWFnZVRvVGV4dHVyZShnbCwgb3B0aW9ucy5ub3JtYWxNYXAsIGdsLlJHQkEsIG9wdGlvbnMucmVwZWF0KTtcblxuICAgIGlmKG9wdGlvbnMuYmFzZUNvbG9yTWFwKSB7XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyBCQVNFX0NPTE9SX1NBTVBMRVIpO1xuICAgICAgICBpbWFnZVRvVGV4dHVyZShnbCwgb3B0aW9ucy5iYXNlQ29sb3JNYXAsIGdsLlJHQiwgb3B0aW9ucy5yZXBlYXQpO1xuICAgIH1cblxuICAgIGlmKG9wdGlvbnMubWF0ZXJpYWxNYXApIHtcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCArIE1BVEVSSUFMX1NBTVBMRVIpO1xuICAgICAgICBpbWFnZVRvVGV4dHVyZShnbCwgb3B0aW9ucy5tYXRlcmlhbE1hcCwgZ2wuUkdCLCBvcHRpb25zLnJlcGVhdCk7XG4gICAgfVxuXG4gICAgaWYob3B0aW9ucy5hbWJpZW50TWFwKSB7XG4gICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTAgKyBBTUJJRU5UX1NBTVBMRVIpO1xuICAgICAgICBpbWFnZVRvVGV4dHVyZShnbCwgb3B0aW9ucy5hbWJpZW50TWFwLCBnbC5SR0JBLCBvcHRpb25zLnJlcGVhdCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmF3QnVmZmVyKGdsKXtcbiAgICBnbC5kcmF3QXJyYXlzKGdsLlRSSUFOR0xFX1NUUklQLCAwLCA0KTtcbn1cblxuZnVuY3Rpb24gYXNzaWduKGEpe1xuICAgIGZvcih2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspe1xuICAgICAgICB2YXIgYiA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgZm9yKHZhciBrZXkgaW4gYil7XG4gICAgICAgICAgICBpZihiLmhhc093blByb3BlcnR5KGtleSkpIGFba2V5XSA9IGJba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYTtcbn1cblxuZnVuY3Rpb24gdmVjMyh4LCB5LCB6KXtcbiAgICB2YXIgdiA9IG5ldyBGbG9hdDMyQXJyYXkoMyk7XG4gICAgdlswXSA9IHg7IHZbMV0gPSB5OyB2WzJdID0gejtcbiAgICByZXR1cm4gdjtcbn1cbm5vcm1hbG1hcC52ZWMzID0gdmVjMztcblxuZnVuY3Rpb24gaXNJbWFnZVBvd2VyT2ZUd28oaW1hZ2Upe1xuICAgIHJldHVybiBpc1Bvd2VyT2ZUd28oaW1hZ2UubmF0dXJhbFdpZHRoIHx8IGltYWdlLndpZHRoKSAmJlxuICAgICAgICBpc1Bvd2VyT2ZUd28oaW1hZ2UubmF0dXJhbEhlaWdodCB8fCBpbWFnZS5oZWlnaHQpO1xufVxuXG5mdW5jdGlvbiBpc1Bvd2VyT2ZUd28oeCkge1xuICByZXR1cm4gKCh4ICE9PSAwKSAmJiAhKHggJiAoeCAtIDEpKSk7XG59XG4iLCJ2YXIgU2hhZGVyID0gcmVxdWlyZSgnLi9zaGFkZXInKTtcblxuZnVuY3Rpb24gU2hhZGVyTWFuYWdlcihnbCwgc291cmNlcywgb3B0aW9ucyl7XG4gICAgdGhpcy5nbCA9IGdsO1xuICAgIHRoaXMuc291cmNlcyA9IHNvdXJjZXM7XG4gICAgdGhpcy5zaGFkZXJzID0gW107XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5wcmVmaXggPSBvcHRpb25zLnByZWZpeCB8fCAnJztcbiAgICB0aGlzLnNvdXJjZUlkcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgdGhpcy5zb3VyY2VJZCA9IDE7XG59XG5tb2R1bGUuZXhwb3J0cyA9IFNoYWRlck1hbmFnZXI7XG5TaGFkZXJNYW5hZ2VyLnByb3RvdHlwZSA9IHtcbiAgICBpbmNsdWRlRXhwcmVzc2lvbjogLyNpbmNsdWRlIFwiKFteXCJdKylcIi8sXG4gICAgcHJlcHJvY2VzczogZnVuY3Rpb24obmFtZSwgY29udGVudCwgaW5jbHVkZWQpIHtcbiAgICAgICAgdmFyIHNvdXJjZUlkID0gdGhpcy5nZXRTb3VyY2VJZChuYW1lKTtcbiAgICAgICAgdmFyIGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgIHZhciBvdXRwdXQgPSBbJyNsaW5lIDEgJyArIHNvdXJjZUlkXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBsaW5lc1tpXTtcbiAgICAgICAgICAgIHZhciBtYXRjaCA9IGxpbmUubWF0Y2godGhpcy5pbmNsdWRlRXhwcmVzc2lvbik7XG4gICAgICAgICAgICBpZihtYXRjaCl7XG4gICAgICAgICAgICAgICAgdmFyIGluY2x1ZGUgPSBtYXRjaFsxXTtcbiAgICAgICAgICAgICAgICBpZighaW5jbHVkZWRbaW5jbHVkZV0pe1xuICAgICAgICAgICAgICAgICAgICBvdXRwdXQucHVzaCh0aGlzLmdldFNvdXJjZShpbmNsdWRlLCB7fSwgaW5jbHVkZWQpKTtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0LnB1c2goJyNsaW5lICcgKyAoaSsyKSArICcgJyArIHNvdXJjZUlkKTtcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZWRbaW5jbHVkZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0LnB1c2goJy8vICcgKyBsaW5lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBvdXRwdXQucHVzaChsaW5lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb3V0cHV0LmpvaW4oJ1xcbicpO1xuICAgIH0sXG4gICAgZ2V0U291cmNlOiBmdW5jdGlvbihuYW1lLCBkZWZpbmVzLCBpbmNsdWRlZCkge1xuICAgICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC9cXC5cXHcrJC8sICcnKTtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSB0aGlzLnNvdXJjZXNbdGhpcy5wcmVmaXggKyBuYW1lXTtcbiAgICAgICAgaWYoY29udGVudCA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NoYWRlciBub3QgZm91bmQgJyArIG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBnbHNsRGVmaW5lcyhkZWZpbmVzKSArIHRoaXMucHJlcHJvY2VzcyhuYW1lLCBjb250ZW50LCBpbmNsdWRlZCk7XG4gICAgfSxcbiAgICBnZXRTb3VyY2VJZDogZnVuY3Rpb24obmFtZSl7XG4gICAgICAgIGlmKCEobmFtZSBpbiB0aGlzLnNvdXJjZUlkcykpe1xuICAgICAgICAgICAgdGhpcy5zb3VyY2VJZHNbbmFtZV0gPSB0aGlzLnNvdXJjZUlkKys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlSWRzW25hbWVdO1xuICAgIH0sXG4gICAgZ2V0U291cmNlTmFtZTogZnVuY3Rpb24oc291cmNlSWQpIHtcbiAgICAgICAgdmFyIHNvdXJjZUlkcyA9IHRoaXMuc291cmNlSWRzO1xuICAgICAgICBmb3IodmFyIG5hbWUgaW4gc291cmNlSWRzKXtcbiAgICAgICAgICAgIGlmKHNvdXJjZUlkc1tuYW1lXSA9PT0gc291cmNlSWQpIHJldHVybiBuYW1lO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBnZXQ6IGZ1bmN0aW9uKHZlcnRleCwgZnJhZywgZGVmaW5lcykge1xuICAgICAgICBpZighZnJhZykge1xuICAgICAgICAgICAgZnJhZyA9IHZlcnRleDtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5ID0gSlNPTi5zdHJpbmdpZnkoW3ZlcnRleCwgZnJhZywgZGVmaW5lc10pO1xuICAgICAgICBpZighKGtleSBpbiB0aGlzLnNoYWRlcnMpKXtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaGFkZXJzW2tleV0gPSBuZXcgU2hhZGVyKHRoaXMuZ2wsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2V0U291cmNlKHZlcnRleCwgZGVmaW5lcywge30pLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdldFNvdXJjZShmcmFnLCBkZWZpbmVzLCB7fSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2goZSl7XG4gICAgICAgICAgICAgICAgdGhyb3cgdGhpcy5yZXNvbHZlRXJyb3IoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc2hhZGVyc1trZXldO1xuICAgIH0sXG4gICAgcmVzb2x2ZUVycm9yOiBmdW5jdGlvbihlKSB7XG4gICAgICAgIGlmKCFlLm1lc3NhZ2UgfHwgIWUubWVzc2FnZS5tYXRjaCgvU2hhZGVyIChjb21waWxlcnxsaW5rZXIpIGVycm9yOi8pKSB7XG4gICAgICAgICAgICByZXR1cm4gZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgc291cmNlSWRFeHByZXNzaW9uID0gLyhFUlJPUjogKShcXGQrKSg6XFxkKzopL2c7XG4gICAgICAgIHZhciBtZXNzYWdlID0gZS5tZXNzYWdlLnJlcGxhY2Uoc291cmNlSWRFeHByZXNzaW9uLCBmdW5jdGlvbihfLCBoZWFkLCBzb3VyY2VJZCwgdGFpbCl7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gdGhpcy5nZXRTb3VyY2VOYW1lKHNvdXJjZUlkKjEgICkgfHwgJ3Vua25vd24tJyArIHNvdXJjZUlkO1xuICAgICAgICAgICAgcmV0dXJuIGhlYWQgKyBzb3VyY2UgKyB0YWlsO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICBpZihtZXNzYWdlID09PSBlLm1lc3NhZ2UpIHJldHVybiBlO1xuICAgICAgICByZXR1cm4gbmV3IEVycm9yKG1lc3NhZ2UpO1xuXG4gICAgfVxufTtcblxuZnVuY3Rpb24gZ2xzbERlZmluZXMoZGVmaW5lcyl7XG4gICAgaWYoIWRlZmluZXMpIHJldHVybiAnJztcbiAgICB2YXIgb3V0cHV0ID0gW107XG4gICAgZm9yKHZhciBrZXkgaW4gZGVmaW5lcyl7XG4gICAgICAgIGlmKGRlZmluZXNba2V5XSAhPSBudWxsKXtcbiAgICAgICAgICAgIG91dHB1dC5wdXNoKCcjZGVmaW5lICcgKyBrZXkgKyAnICcgKyBkZWZpbmVzW2tleV0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQuam9pbignXFxuJyk7XG59XG4iLCJmdW5jdGlvbiBTaGFkZXIoZ2wsIHZlcnRleFNvdXJjZSwgZnJhZ21lbnRTb3VyY2Upe1xuICAgIHRoaXMuZ2wgPSBnbDtcbiAgICB0aGlzLnByb2dyYW0gPSBidWlsZFByb2dyYW0oZ2wsIHZlcnRleFNvdXJjZSwgZnJhZ21lbnRTb3VyY2UpO1xuICAgIHRoaXMudW5pZm9ybUluZm9zID0gcmVmbGVjdFVuaWZvcm1JbmZvcm1hdGlvbihnbCwgdGhpcy5wcm9ncmFtKTtcbiAgICB0aGlzLnVuaWZvcm1WYWx1ZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIHRoaXMudW5pZm9ybVR5cGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICB0aGlzLmF0dHJpYnV0ZUxvY2F0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IFNoYWRlcjtcblNoYWRlci5wcm90b3R5cGUgPSB7XG4gICAgdXNlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5nbC51c2VQcm9ncmFtKHRoaXMucHJvZ3JhbSk7XG4gICAgfSxcbiAgICAvLyBkb2VzIG5vdCBjaGVjayBmb3IgaGFzT3duUHJvcGVydHkgb24gdmFsdWVzXG4gICAgLy8gYWxsb3dzIGZvciBwcm90b3R5cGljYWwgaW5oZXJpdGFuY2VcbiAgICB1bmlmb3JtczogZnVuY3Rpb24gKHZhbHVlcykge1xuICAgICAgICBmb3IodmFyIG5hbWUgaW4gdmFsdWVzKSB7XG4gICAgICAgICAgICB0aGlzLnNldFVuaWZvcm0obmFtZSwgdmFsdWVzW25hbWVdKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgc2V0VW5pZm9ybTogZnVuY3Rpb24obmFtZSwgdmFsdWUpe1xuICAgICAgICB2YXIgaW5mbyA9IHRoaXMudW5pZm9ybUluZm9zW25hbWVdO1xuICAgICAgICBpZighaW5mbykge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCdzaGFkZXIgbWlzc2luZyB1bmlmb3JtJywgbmFtZSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHR5cGUgPSBpbmZvLnR5cGU7XG4gICAgICAgIGlmKGlzVW5pZm9ybVR5cGVTY2FsYXIodGhpcy5nbCwgdHlwZSkpe1xuICAgICAgICAgICAgaWYodmFsdWUgPT09IHRoaXMudW5pZm9ybVZhbHVlc1tuYW1lXSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy51bmlmb3JtVmFsdWVzW25hbWVdID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgb2xkVmFsdWUgPSB0aGlzLnVuaWZvcm1WYWx1ZXNbbmFtZV07XG4gICAgICAgICAgICBpZihvbGRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgaWYoY29tcGFyZUFuZFNldChvbGRWYWx1ZSwgdmFsdWUpKSByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1WYWx1ZXNbbmFtZV0gPSBuZXcgRmxvYXQzMkFycmF5KHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzZXRVbmlmb3JtKHRoaXMuZ2wsIGluZm8ubG9jYXRpb24sIHR5cGUsIHZhbHVlKTtcbiAgICB9LFxuICAgIGdldFVuaWZvcm1Mb2NhdGlvbjogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICBpZighKG5hbWUgaW4gdGhpcy51bmlmb3JtTG9jYXRpb25zKSl7XG4gICAgICAgICAgICB2YXIgbG9jYXRpb24gPSB0aGlzLmdsLmdldFVuaWZvcm1Mb2NhdGlvbih0aGlzLnByb2dyYW0sIG5hbWUpO1xuICAgICAgICAgICAgaWYobG9jYXRpb24gPCAwKXtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ3NoYWRlciBtaXNzaW5nIHVuaWZvcm0nLCBuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudW5pZm9ybUxvY2F0aW9uc1tuYW1lXSA9IGxvY2F0aW9uO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnVuaWZvcm1Mb2NhdGlvbnNbbmFtZV07XG4gICAgfSxcbiAgICBnZXRBdHRyaWJMb2NhdGlvbjogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICBpZighKG5hbWUgaW4gdGhpcy5hdHRyaWJ1dGVMb2NhdGlvbnMpKXtcbiAgICAgICAgICAgIHZhciBsb2NhdGlvbiA9IHRoaXMuZ2wuZ2V0QXR0cmliTG9jYXRpb24odGhpcy5wcm9ncmFtLCBuYW1lKTtcbiAgICAgICAgICAgIGlmKGxvY2F0aW9uIDwgMCl7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdzaGFkZXIgbWlzc2luZyBhdHRyaWJ1dGUnLCBuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYXR0cmlidXRlTG9jYXRpb25zW25hbWVdID0gbG9jYXRpb247XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cmlidXRlTG9jYXRpb25zW25hbWVdO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGlzVW5pZm9ybVR5cGVTY2FsYXIoZ2wsIHR5cGUpe1xuICAgIHN3aXRjaCh0eXBlKXtcbiAgICAgICAgY2FzZSBnbC5GTE9BVDpcbiAgICAgICAgY2FzZSBnbC5JTlQ6XG4gICAgICAgIGNhc2UgZ2wuVU5TSUdORURfSU5UOlxuICAgICAgICBjYXNlIGdsLlNBTVBMRVJfMkQ6XG4gICAgICAgIGNhc2UgZ2wuU0FNUExFUl9DVUJFOlxuICAgICAgICBjYXNlIGdsLkJPT0w6XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNldFVuaWZvcm0oZ2wsIGxvY2F0aW9uLCB0eXBlLCB2YWx1ZSl7XG4gICAgc3dpdGNoKHR5cGUpIHtcbiAgICAgICAgY2FzZSBnbC5GTE9BVDpcbiAgICAgICAgICAgIGdsLnVuaWZvcm0xZihsb2NhdGlvbiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZ2wuSU5UOlxuICAgICAgICBjYXNlIGdsLlVOU0lHTkVEX0lOVDpcbiAgICAgICAgY2FzZSBnbC5TQU1QTEVSXzJEOlxuICAgICAgICBjYXNlIGdsLlNBTVBMRVJfQ1VCRTpcbiAgICAgICAgY2FzZSBnbC5CT09MOlxuICAgICAgICAgICAgZ2wudW5pZm9ybTFpKGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBnbC5GTE9BVF9WRUMzOlxuICAgICAgICAgICAgZ2wudW5pZm9ybTNmdihsb2NhdGlvbiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZ2wuRkxPQVRfVkVDMjpcbiAgICAgICAgICAgIGdsLnVuaWZvcm0yZnYobG9jYXRpb24sIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGdsLkZMT0FUX1ZFQzQ6XG4gICAgICAgICAgICBnbC51bmlmb3JtNGZ2KGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBnbC5GTE9BVF9NQVQ0OlxuICAgICAgICAgICAgZ2wudW5pZm9ybU1hdHJpeDRmdihsb2NhdGlvbiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZ2wuRkxPQVRfTUFUMzpcbiAgICAgICAgICAgIGdsLnVuaWZvcm1NYXRyaXgzZnYobG9jYXRpb24sIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGdsLkZMT0FUX01BVDI6XG4gICAgICAgICAgICBnbC51bmlmb3JtTWF0cml4MmZ2KGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBnbC5JTlRfVkVDMzpcbiAgICAgICAgICAgIGdsLnVuaWZvcm0zaXYobG9jYXRpb24sIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGdsLklOVF9WRUMyOlxuICAgICAgICAgICAgZ2wudW5pZm9ybTJpdihsb2NhdGlvbiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZ2wuSU5UX1ZFQzQ6XG4gICAgICAgICAgICBnbC51bmlmb3JtNGl2KGxvY2F0aW9uLCB2YWx1ZSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignVW5rbm93biB1bmlmb3JtIHR5cGUnLCBuYW1lLCB0eXBlKTtcbiAgICB9XG5cbn1cblxuZnVuY3Rpb24gcmVmbGVjdFVuaWZvcm1JbmZvcm1hdGlvbihnbCwgcHJvZ3JhbSl7XG4gICAgdmFyIHVuaWZvcm1zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICB2YXIgbkFjdGl2ZVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBnbC5BQ1RJVkVfVU5JRk9STVMpO1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBuQWN0aXZlVW5pZm9ybXM7IGkrKyl7XG4gICAgICAgIHZhciB1bmlmb3JtID0gZ2wuZ2V0QWN0aXZlVW5pZm9ybShwcm9ncmFtLCBpKTtcbiAgICAgICAgdW5pZm9ybXNbdW5pZm9ybS5uYW1lXSA9IHtcbiAgICAgICAgICAgIHR5cGU6IHVuaWZvcm0udHlwZSxcbiAgICAgICAgICAgIHNpemU6IHVuaWZvcm0uc2l6ZSxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbSwgdW5pZm9ybS5uYW1lKVxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdW5pZm9ybXM7XG59XG5cbmZ1bmN0aW9uIGNvbXBpbGVTaGFkZXIoZ2wsIHR5cGUsIHNvdXJjZSl7XG4gICAgdmFyIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcbiAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpO1xuICAgIGdsLmNvbXBpbGVTaGFkZXIoc2hhZGVyKTtcbiAgICBpZighZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTaGFkZXIgY29tcGlsZXIgZXJyb3I6IFwiJyArIGdsLmdldFNoYWRlckluZm9Mb2coc2hhZGVyKSArICdcIicpO1xuICAgIH1cbiAgICByZXR1cm4gc2hhZGVyO1xufVxuXG5mdW5jdGlvbiBidWlsZFByb2dyYW0oZ2wsIHZlcnRleFNoYWRlclNvdXJjZSwgZnJhZ21lbnRTaGFkZXJTb3VyY2Upe1xuICAgIHZhciBmcmFnbWVudFNoYWRlciA9IGNvbXBpbGVTaGFkZXIoZ2wsIGdsLkZSQUdNRU5UX1NIQURFUiwgZnJhZ21lbnRTaGFkZXJTb3VyY2UpO1xuICAgIHZhciB2ZXJ0ZXhTaGFkZXIgPSBjb21waWxlU2hhZGVyKGdsLCBnbC5WRVJURVhfU0hBREVSLCB2ZXJ0ZXhTaGFkZXJTb3VyY2UpO1xuICAgIHZhciBwcm9ncmFtID0gZ2wuY3JlYXRlUHJvZ3JhbSgpO1xuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCB2ZXJ0ZXhTaGFkZXIpO1xuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnbWVudFNoYWRlcik7XG4gICAgZ2wuYmluZEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIDAsIFwiYVBvc2l0aW9uXCIpO1xuICAgIGdsLmxpbmtQcm9ncmFtKHByb2dyYW0pO1xuICAgIGlmKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignU2hhZGVyIGxpbmtlciBlcnJvcjogJyArIGdsLmdldFByb2dyYW1JbmZvTG9nKHByb2dyYW0pKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb2dyYW07XG59XG5cbi8vIHNldHMgYSB0byBiXG4vLyByZXR1cm5zIHRydWUgaWYgYSB3YXMgZXF1YWwgdG8gYiBhbHJlYWR5XG5mdW5jdGlvbiBjb21wYXJlQW5kU2V0KGEsIGIpe1xuICAgIHZhciBlcXVhbCA9IHRydWU7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspe1xuICAgICAgICBpZihhW2ldICE9PSBiW2ldKXtcbiAgICAgICAgICAgIGFbaV0gPSBiW2ldO1xuICAgICAgICAgICAgZXF1YWwgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZXF1YWw7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFwiI2lmZGVmIFVTRV9BTUJJRU5UX01BUFxcbnVuaWZvcm0gc2FtcGxlcjJEIHVBbWJpZW50U2FtcGxlcjtcXG51bmlmb3JtIGZsb2F0IHVBbWJpZW50O1xcblxcbnZvaWQgYWRkQW1iaWVudChpbm91dCB2ZWM0IGZyYWdDb2xvcil7XFxuICAgIHZlYzQgYW1iaWVudCA9IHRleHR1cmUyRCh1QW1iaWVudFNhbXBsZXIsIHZVdik7XFxuICAgIGFtYmllbnQucmdiICo9IHVBbWJpZW50ICogYW1iaWVudC5hO1xcbiAgICBmcmFnQ29sb3IucmdiID0gZnJhZ0NvbG9yLnJnYipmcmFnQ29sb3IuYSArIGFtYmllbnQucmdiO1xcbiAgICAvLyB0aGlzIGlzIGEgYml0IG9mIGEgaGFjayBidXQgaXQgYWxsb3dzIGZvciBhIHNlcGFyYXRlIGFscGhhIGluIGJvdGhcXG4gICAgLy8gd2hpbGUgbm90IG1lc3NpbmcgdXAgd2hlbiB0aGV5IGFyZSBibGVuZGVkXFxuICAgIGZyYWdDb2xvci5hID0gbWF4KGZyYWdDb2xvci5hLCBhbWJpZW50LmEpO1xcbn1cXG4jZW5kaWZcXG5cIjtcbiIsIm1vZHVsZS5leHBvcnRzID0gXCIjaW5jbHVkZSBcXFwiY29tbW9uLmdsc2xcXFwiXFxuXFxuLy8gRXBpYyBhcHByb3hpbWF0aW9uIG9mIHNjaGxpY2tzXFxuLy8gRjAgaXMgdGhlIHNwZWN1bGFyIHJlZmxlY3RhbmNlIGF0IG5vcm1hbCBpbmNpZGVuY2UuXFxuLy8gdmlhOiBodHRwOi8vYmxvZy5zZWxmc2hhZG93LmNvbS9wdWJsaWNhdGlvbnMvczIwMTMtc2hhZGluZy1jb3Vyc2Uva2FyaXMvczIwMTNfcGJzX2VwaWNfbm90ZXNfdjIucGRmXFxudmVjMyBGX3NjaGxpY2soIHZlYzMgRjAsIGZsb2F0IGRvdExIICkge1xcblxcdGZsb2F0IGZyZXNuZWwgPSBleHAyKCAoIC01LjU1NDczICogZG90TEggLSA2Ljk4MzE2ICkgKiBkb3RMSCApO1xcblxcdHJldHVybiAoIDEuMCAtIEYwICkgKiBmcmVzbmVsICsgRjA7XFxufVxcblxcbi8vIG5vcm1hbCBkaXN0cmlidXRpb25cXG4vLyBhbHBoYSA9IHJvdWdobmVzc14yXFxuLy8gdmlhOiBodHRwOi8vYmxvZy5zZWxmc2hhZG93LmNvbS9wdWJsaWNhdGlvbnMvczIwMTMtc2hhZGluZy1jb3Vyc2Uva2FyaXMvczIwMTNfcGJzX2VwaWNfbm90ZXNfdjIucGRmXFxuZmxvYXQgRF9nZ3goY29uc3QgaW4gZmxvYXQgZG90TkgsIGNvbnN0IGluIGZsb2F0IGFscGhhKSB7XFxuICAgIGZsb2F0IGFscGhhU3F1YXJlZCA9IGFscGhhICogYWxwaGE7XFxuICAgIGZsb2F0IGRlbm9taW5hdG9yID0gZG90TkgqZG90TkggKiAoYWxwaGFTcXVhcmVkIC0gMS4wKSArIDEuMDtcXG4gICAgcmV0dXJuIChhbHBoYVNxdWFyZWQpIC8gKFBJICogZGVub21pbmF0b3IqZGVub21pbmF0b3IpO1xcbn1cXG5cXG4vLyBnZW9tZXRyaWMgYXR0ZW51YXRpb25cXG4vLyBodHRwOi8vYmxvZy5zZWxmc2hhZG93LmNvbS9wdWJsaWNhdGlvbnMvczIwMTMtc2hhZGluZy1jb3Vyc2Uva2FyaXMvczIwMTNfcGJzX2VwaWNfbm90ZXNfdjIucGRmXFxuZmxvYXQgR19nZ3goY29uc3QgaW4gZmxvYXQgZG90TkwsIGNvbnN0IGluIGZsb2F0IGRvdE5WLCBjb25zdCBpbiBmbG9hdCByb3VnaG5lc3MpIHtcXG4gICAgZmxvYXQgayA9IChyb3VnaG5lc3MgKyAxLjApO1xcbiAgICBrID0gayprIC8gOC4wO1xcbiAgICBmbG9hdCBsID0gZG90TkwgLyAoIGRvdE5MICogKDEuMC1rKSArIGspO1xcbiAgICBmbG9hdCB2ID0gZG90TlYgLyAoIGRvdE5WICogKDEuMC1rKSArIGspO1xcbiAgICByZXR1cm4gbCAqIHY7XFxufVxcblxcbi8vIG4gPSBub3JtYWxcXG4vLyBsID0gbGlnaHQgZGlyZWN0aW9uXFxuLy8gdiA9IHZpZXcgZGlyZWN0aW9uXFxuLy8gRjAgc3BlY3VsYXIgY29sb3JcXG4vLyBoID0gaGFsZiBhbmdsZSBiZXR3ZWVuIGwgYW5kIHZcXG52ZWMzIGJyZGZfZ2d4KHZlYzMgbiwgdmVjMyBsLCB2ZWMzIHYsIHZlYzMgRjAsIGZsb2F0IHJvdWdobmVzcykge1xcbiAgICBmbG9hdCBhbHBoYSA9IHJvdWdobmVzcyAqIHJvdWdobmVzcztcXG4gICAgdmVjMyBoID0gbm9ybWFsaXplKGwgKyB2KTtcXG5cXG4gICAgZmxvYXQgZG90TkwgPSBzYXR1cmF0ZShkb3QobiwgbCkpO1xcbiAgICBmbG9hdCBkb3ROViA9IHNhdHVyYXRlKGRvdChuLCB2KSk7XFxuICAgIGZsb2F0IGRvdE5IID0gc2F0dXJhdGUoZG90KG4sIGgpKTtcXG4gICAgZmxvYXQgZG90TEggPSBzYXR1cmF0ZShkb3QobCwgaCkpO1xcblxcbiAgICB2ZWMzIEYgPSBGX3NjaGxpY2soRjAsIGRvdExIKTtcXG4gICAgZmxvYXQgRCA9IERfZ2d4KGRvdE5ILCBhbHBoYSk7XFxuICAgIGZsb2F0IEcgPSBHX2dneChkb3ROTCwgZG90TlYsIHJvdWdobmVzcyk7XFxuXFxuICAgIHJldHVybiBGICogKCBHICogRCApO1xcbn1cXG5cIjtcbiIsIm1vZHVsZS5leHBvcnRzID0gXCIjZGVmaW5lIHNhdHVyYXRlKHgpIGNsYW1wKHgsIDAuMCwgMS4wKVxcbmNvbnN0IGZsb2F0IFBJID0gMy4xNDE1OTI2NTM1OTtcXG5jb25zdCBmbG9hdCBSRUNJUFJPQ0FMX1BJID0gMS4wIC8gUEk7XFxuY29uc3QgZmxvYXQgRVBTSUxPTiA9IDFlLTMwO1xcblxcbmZsb2F0IGdhbW1hRW5jb2RlKGNvbnN0IGluIGZsb2F0IGxpbmVhcil7XFxuICAgIHJldHVybiBwb3cobGluZWFyLCAxLjAvMi4yKTtcXG59XFxudmVjMyBnYW1tYUVuY29kZShjb25zdCBpbiB2ZWMzIGxpbmVhcikge1xcbiAgICByZXR1cm4gcG93KGxpbmVhciwgdmVjMygxLjAvMi4yKSk7XFxufVxcbnZlYzQgZ2FtbWFFbmNvZGUoY29uc3QgaW4gdmVjNCBsaW5lYXIpIHtcXG4gICAgcmV0dXJuIHZlYzQocG93KGxpbmVhci5yZ2IsIHZlYzMoMS4wLzIuMikpLCBsaW5lYXIuYSk7XFxufVxcblxcbnZlYzMgZ2FtbWFEZWNvZGUoY29uc3QgaW4gdmVjMyBsaW5lYXIpIHtcXG4gICAgcmV0dXJuIHBvdyhsaW5lYXIsIHZlYzMoMi4yKSk7XFxufVxcblwiO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBcIi8vIGJhc2VkIG9uIG52aWRpYSBmeGFhIDMuMTEgY29uc29sZSBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9ia2FyYWR6aWMvNjAxMTQzMVxcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taXRzdWhpa28vd2ViZ2wtbWVpbmNyYWZ0L2Jsb2IvbWFzdGVyL2Fzc2V0cy9zaGFkZXJzL2Z4YWEuZ2xzbFxcbi8vIGl0IGhhcyBiZWVuIG1vZGlmaWVkIHdpdGggbGl0dGxlIHRlc3RpbmcgYW5kIGlzIHF1aXRlIHBvc3NpYmx5IGJyb2tlbiBub3cuXFxuXFxuLy8gICAwLjEyNSBsZWF2ZXMgbGVzcyBhbGlhc2luZywgYnV0IGlzIHNvZnRlciAoZGVmYXVsdCEhISlcXG4vLyAgIDAuMjUgbGVhdmVzIG1vcmUgYWxpYXNpbmcsIGFuZCBpcyBzaGFycGVyXFxuY29uc3QgZmxvYXQgZnhhYUVkZ2VUaHJlc2hvbGQgPSAwLjEyNTtcXG4vLyAgIDAuMDYgLSBmYXN0ZXIgYnV0IG1vcmUgYWxpYXNpbmcgaW4gZGFya3NcXG4vLyAgIDAuMDUgLSBkZWZhdWx0XFxuLy8gICAwLjA0IC0gc2xvd2VyIGFuZCBsZXNzIGFsaWFzaW5nIGluIGRhcmtzXFxuY29uc3QgZmxvYXQgZnhhYUNvbnNvbGVFZGdlVGhyZXNob2xkTWluID0gMC4wMDtcXG5cXG4vLyAgIDguMCBpcyBzaGFycGVyIChkZWZhdWx0ISEhKVxcbi8vICAgNC4wIGlzIHNvZnRlclxcbi8vICAgMi4wIGlzIHJlYWxseSBzb2Z0IChnb29kIG9ubHkgZm9yIHZlY3RvciBncmFwaGljcyBpbnB1dHMpXFxuY29uc3QgZmxvYXQgZnhhYUNvbnNvbGVFZGdlU2hhcnBuZXNzID0gOC4wO1xcblxcbi8vIGZvciBzb21lIHJlYXNvbiBmeGFhIHdhbnRzIGdhbW1hIGVuY29kZWQgdmFsdWVzXFxuLy8gc28gSSBnYW1tYSBlbmNvZGUgb24gdGhlIGZseVxcbmZsb2F0IGZ4YWFMdW1hKHZlYzQgY29sb3Ipe1xcbiAgICBjb25zdCB2ZWM0IGx1bWEgPSB2ZWM0KDAuMjk5LCAwLjU4NywgMC4xMTQsIDAuMCk7XFxuICAgIHJldHVybiBnYW1tYUVuY29kZShkb3Qoc2F0dXJhdGUoY29sb3IpLCBsdW1hKSk7XFxufVxcblxcbnZlYzQgZnhhYSh2ZWMyIHV2LCBjb25zdCB2ZWMyIHJlc29sdXRpb24sIHNhbXBsZXIyRCBzYW1wbGVyKSB7XFxuICAgIC8vICAgICBOID0gMC41MCAoZGVmYXVsdClcXG4gICAgLy8gICAgIE4gPSAwLjMzIChzaGFycGVyKVxcbiAgICB2ZWM0IGZ4YWFDb25zb2xlUmNwRnJhbWVPcHQgPSB2ZWM0KDAuMzMpIC8gdmVjNCgtcmVzb2x1dGlvbi54LCAtcmVzb2x1dGlvbi55LCByZXNvbHV0aW9uLngsIHJlc29sdXRpb24ueSk7XFxuICAgIHZlYzQgZnhhYUNvbnNvbGVSY3BGcmFtZU9wdDIgPSB2ZWM0KDIuMCkgLyB2ZWM0KC1yZXNvbHV0aW9uLngsIC1yZXNvbHV0aW9uLnksIHJlc29sdXRpb24ueCwgcmVzb2x1dGlvbi55KTtcXG5cXG4gICAgLy8gdmVjMiBpbnZlcnNlVlAgPSB2ZWMyKDEuMCAvIHVWaWV3cG9ydFNpemUueCwgMS4wIC8gdVZpZXdwb3J0U2l6ZS55KTtcXG4gICAgdmVjMiBwaXhlbE9mZnNldCA9IHZlYzIoMS4wKS9yZXNvbHV0aW9uO1xcblxcbiAgICB2ZWM0IHJnYk53ID0gdGV4dHVyZTJEKHNhbXBsZXIsICh1diArIHZlYzIoLTEuMCwgLTEuMCkpICogcGl4ZWxPZmZzZXQpO1xcbiAgICB2ZWM0IHJnYk5lID0gdGV4dHVyZTJEKHNhbXBsZXIsICh1diArIHZlYzIoMS4wLCAtMS4wKSkgKiBwaXhlbE9mZnNldCk7XFxuICAgIHZlYzQgcmdiU3cgPSB0ZXh0dXJlMkQoc2FtcGxlciwgKHV2ICsgdmVjMigtMS4wLCAxLjApKSAqIHBpeGVsT2Zmc2V0KTtcXG4gICAgdmVjNCByZ2JTZSA9IHRleHR1cmUyRChzYW1wbGVyLCAodXYgKyB2ZWMyKDEuMCwgMS4wKSkgKiBwaXhlbE9mZnNldCk7XFxuICAgIHZlYzQgcmdiTSAgPSB0ZXh0dXJlMkQoc2FtcGxlciwgdXYpO1xcblxcbiAgICAvLyBmZnhhYSB3YW50cyBsdW1hIHRvIGJlXFxuICAgIGZsb2F0IGx1bWFOdyA9IGZ4YWFMdW1hKHJnYk53KTtcXG4gICAgZmxvYXQgbHVtYU5lID0gZnhhYUx1bWEocmdiTmUpO1xcbiAgICBmbG9hdCBsdW1hU3cgPSBmeGFhTHVtYShyZ2JTdyk7XFxuICAgIGZsb2F0IGx1bWFTZSA9IGZ4YWFMdW1hKHJnYlNlKTtcXG4gICAgZmxvYXQgbHVtYU0gID0gZnhhYUx1bWEocmdiTSk7XFxuXFxuICAgIGZsb2F0IGx1bWFNYXhOd1N3ID0gbWF4KGx1bWFOdywgbHVtYVN3KTtcXG4gICAgbHVtYU5lICs9IDEuMC8zODQuMDtcXG4gICAgZmxvYXQgbHVtYU1pbk53U3cgPSBtaW4obHVtYU53LCBsdW1hU3cpO1xcblxcbiAgICBmbG9hdCBsdW1hTWF4TmVTZSA9IG1heChsdW1hTmUsIGx1bWFTZSk7XFxuICAgIGZsb2F0IGx1bWFNaW5OZVNlID0gbWluKGx1bWFOZSwgbHVtYVNlKTtcXG5cXG4gICAgZmxvYXQgbHVtYU1heCA9IG1heChsdW1hTWF4TmVTZSwgbHVtYU1heE53U3cpO1xcbiAgICBmbG9hdCBsdW1hTWluID0gbWluKGx1bWFNaW5OZVNlLCBsdW1hTWluTndTdyk7XFxuXFxuICAgIGZsb2F0IGx1bWFNYXhTY2FsZWQgPSBsdW1hTWF4ICogZnhhYUVkZ2VUaHJlc2hvbGQ7XFxuXFxuICAgIGZsb2F0IGx1bWFNaW5NID0gbWluKGx1bWFNaW4sIGx1bWFNKTtcXG4gICAgZmxvYXQgbHVtYU1heFNjYWxlZENsYW1wZWQgPSBtYXgoZnhhYUNvbnNvbGVFZGdlVGhyZXNob2xkTWluLCBsdW1hTWF4U2NhbGVkKTtcXG4gICAgZmxvYXQgbHVtYU1heE0gPSBtYXgobHVtYU1heCwgbHVtYU0pO1xcbiAgICBmbG9hdCBkaXJTd01pbnVzTmUgPSBsdW1hU3cgLSBsdW1hTmU7XFxuICAgIGZsb2F0IGx1bWFNYXhTdWJNaW5NID0gbHVtYU1heE0gLSBsdW1hTWluTTtcXG4gICAgZmxvYXQgZGlyU2VNaW51c053ID0gbHVtYVNlIC0gbHVtYU53O1xcbiAgICAvLyBlYXJseSBvdXRcXG4gICAgLy8gaWYobHVtYU1heFN1Yk1pbk0gPCBsdW1hTWF4U2NhbGVkQ2xhbXBlZCkgcmV0dXJuIHZlYzQoMS4wLCAwLjAsIDAuMCwgMS4wKTtcXG4gICAgaWYobHVtYU1heFN1Yk1pbk0gPCBsdW1hTWF4U2NhbGVkQ2xhbXBlZCkgcmV0dXJuIHJnYk07XFxuXFxuICAgIHZlYzIgZGlyID0gZGlyU3dNaW51c05lICsgdmVjMihkaXJTZU1pbnVzTncsIC1kaXJTZU1pbnVzTncpO1xcblxcbiAgICB2ZWMyIGRpcjEgPSBub3JtYWxpemUoZGlyLnh5KTtcXG4gICAgLy8gdGhpcyBpcyBzdWJvcHRpbWFsLiBJdCB3b3VsZCBwcm9iYWJseSBiZSBtb3JlIGVmZmljaWVudCB0byBkbyB0aGlzIGluIGFub3RoZXIgc3RhZ2UuXFxuICAgIHZlYzQgcmdieU4xID0gZ2FtbWFFbmNvZGUoc2F0dXJhdGUodGV4dHVyZTJEKHNhbXBsZXIsIHV2IC0gZGlyMSAqIGZ4YWFDb25zb2xlUmNwRnJhbWVPcHQuencpKSk7XFxuICAgIHZlYzQgcmdieVAxID0gZ2FtbWFFbmNvZGUoc2F0dXJhdGUodGV4dHVyZTJEKHNhbXBsZXIsIHV2ICsgZGlyMSAqIGZ4YWFDb25zb2xlUmNwRnJhbWVPcHQuencpKSk7XFxuXFxuICAgIGZsb2F0IGRpckFic01pblRpbWVzQyA9IG1pbihhYnMoZGlyMS54KSwgYWJzKGRpcjEueSkpICogZnhhYUNvbnNvbGVFZGdlU2hhcnBuZXNzO1xcbiAgICB2ZWMyIGRpcjIgPSBjbGFtcChkaXIxLnh5IC8gZGlyQWJzTWluVGltZXNDLCAtMi4wLCAyLjApO1xcblxcbiAgICB2ZWM0IHJnYnlOMiA9IGdhbW1hRW5jb2RlKHNhdHVyYXRlKHRleHR1cmUyRChzYW1wbGVyLCB1diAtIGRpcjIgKiBmeGFhQ29uc29sZVJjcEZyYW1lT3B0Mi56dykpKTtcXG4gICAgdmVjNCByZ2J5UDIgPSBnYW1tYUVuY29kZShzYXR1cmF0ZSh0ZXh0dXJlMkQoc2FtcGxlciwgdXYgKyBkaXIyICogZnhhYUNvbnNvbGVSY3BGcmFtZU9wdDIuencpKSk7XFxuXFxuICAgIHZlYzQgcmdieUEgPSByZ2J5TjEgKyByZ2J5UDE7XFxuICAgIHZlYzQgcmdieUIgPSAoKHJnYnlOMiArIHJnYnlQMikgKiAwLjI1KSArIChyZ2J5QSAqIDAuMjUpO1xcblxcbiAgICBib29sIHR3b1RhcCA9IChyZ2J5Qi55IDwgbHVtYU1pbikgfHwgKHJnYnlCLnkgPiBsdW1hTWF4KTtcXG5cXG4gICAgaWYodHdvVGFwKSByZ2J5Qi54eXogPSByZ2J5QS54eXogKiAwLjU7XFxuXFxuICAgIHJldHVybiByZ2J5QjtcXG59XFxuXCI7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFwicHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xcbiNpbmNsdWRlIFxcXCJjb21tb24uZ2xzbFxcXCJcXG4jaW5jbHVkZSBcXFwiYnJkZi5nbHNsXFxcIlxcblxcbnVuaWZvcm0gc2FtcGxlcjJEIHVOb3JtYWxTYW1wbGVyO1xcblxcbiNpZmRlZiBVU0VfQkFTRV9DT0xPUl9NQVBcXG51bmlmb3JtIHNhbXBsZXIyRCB1QmFzZUNvbG9yU2FtcGxlcjtcXG4jZW5kaWZcXG5cXG4jaWZkZWYgVVNFX01BVEVSSUFMX01BUFxcbnVuaWZvcm0gc2FtcGxlcjJEIHVNYXRlcmlhbFNhbXBsZXI7XFxuI2VuZGlmXFxuXFxudW5pZm9ybSB2ZWMzIHVCYXNlQ29sb3I7XFxudW5pZm9ybSBmbG9hdCB1TWV0YWxuZXNzO1xcbnVuaWZvcm0gZmxvYXQgdVJvdWdobmVzcztcXG5cXG4jaWZkZWYgSVNfUE9JTlRfTElHSFRcXG51bmlmb3JtIHZlYzMgdUxpZ2h0UG9zaXRpb247XFxuI2VuZGlmXFxuXFxuI2lmZGVmIFVTRV9TU1NcXG51bmlmb3JtIGZsb2F0IHVTdWJTdXJmYWNlU2NhdHRlcmluZztcXG4jZW5kaWZcXG5cXG4jaWZkZWYgSVNfRElSRUNUSU9OQUxfTElHSFRcXG51bmlmb3JtIHZlYzMgdUxpZ2h0RGlyZWN0aW9uO1xcbiNlbmRpZlxcblxcbnVuaWZvcm0gdmVjMyB1TGlnaHRDb2xvcjtcXG51bmlmb3JtIGZsb2F0IHVWaWV3cG9ydEFzcGVjdDtcXG51bmlmb3JtIGZsb2F0IHVTY2FsZTtcXG5cXG52YXJ5aW5nIHZlYzIgdlV2O1xcbnZhcnlpbmcgdmVjMyB2UG9zaXRpb247XFxuXFxuI2lmZGVmIFVTRV9TSU5HTEVfUEFTU1xcbiNpbmNsdWRlIFxcXCJhbWJpZW50Lmdsc2xcXFwiXFxuI2VuZGlmXFxuXFxuY29uc3QgdmVjMyBleWUgPSB2ZWMzKDAuNSwgMC41LCAxMDAuMCk7XFxuXFxuZmxvYXQgYXR0ZW51YXRpb24oZmxvYXQgZGlzdGFuY2Upe1xcbiAgICByZXR1cm4gIDEuMC8oZGlzdGFuY2UqZGlzdGFuY2UpO1xcbn1cXG5cXG52ZWMzIHJnYlRvTm9ybWFsKHZlYzMgcmdiKXtcXG4gICAgcmV0dXJuIG5vcm1hbGl6ZShyZ2IgLSB2ZWMzKDAuNSkpO1xcbn1cXG5cXG52b2lkIG1haW4oKXtcXG4gICAgdmVjNCBub3JtYWxTYW1wbGUgPSB0ZXh0dXJlMkQodU5vcm1hbFNhbXBsZXIsIHZVdik7XFxuICAgIGZsb2F0IGFscGhhID0gbm9ybWFsU2FtcGxlLmE7XFxuICAgIHZlYzMgbm9ybWFsID0gcmdiVG9Ob3JtYWwobm9ybWFsU2FtcGxlLnJnYik7XFxuI2lmZGVmIFVTRV9TU1NcXG4gICAgdmVjNCBkaWZmdXNlTm9ybWFsU2FtcGxlID0gdGV4dHVyZTJEKHVOb3JtYWxTYW1wbGVyLCB2VXYsIHVTdWJTdXJmYWNlU2NhdHRlcmluZyk7XFxuICAgIHZlYzMgZGlmZnVzZU5vcm1hbCA9IHJnYlRvTm9ybWFsKGRpZmZ1c2VOb3JtYWxTYW1wbGUucmdiKTtcXG4jZWxzZVxcbiNkZWZpbmUgZGlmZnVzZU5vcm1hbCBub3JtYWxcXG4jZW5kaWZcXG5cXG4gICAgZmxvYXQgbWV0YWxuZXNzID0gdU1ldGFsbmVzcztcXG4gICAgZmxvYXQgcm91Z2huZXNzID0gdVJvdWdobmVzcztcXG5cXG4jaWZkZWYgVVNFX01BVEVSSUFMX01BUFxcbiAgICB2ZWM0IG1hdGVyaWFsU2FtcGxlID0gdGV4dHVyZTJEKHVNYXRlcmlhbFNhbXBsZXIsIHZVdik7XFxuICAgIG1ldGFsbmVzcyAqPSBtYXRlcmlhbFNhbXBsZS5yO1xcbiAgICByb3VnaG5lc3MgKj0gbWF0ZXJpYWxTYW1wbGUuZztcXG4gICAgZmxvYXQgb2NjbHVzaW9uID0gbWF0ZXJpYWxTYW1wbGUuYjtcXG4jZW5kaWZcXG5cXG4gICAgbWV0YWxuZXNzID0gc2F0dXJhdGUobWV0YWxuZXNzKTtcXG4gICAgcm91Z2huZXNzID0gY2xhbXAocm91Z2huZXNzLCBFUFNJTE9OLCAxLjApO1xcblxcbiAgICB2ZWMzIGJhc2VDb2xvciA9IHVCYXNlQ29sb3I7XFxuXFxuI2lmZGVmIFVTRV9CQVNFX0NPTE9SX01BUFxcbiAgICB2ZWM0IGJhc2VDb2xvclNhbXBsZSA9IHRleHR1cmUyRCh1QmFzZUNvbG9yU2FtcGxlciwgdlV2KTtcXG4gICAgYmFzZUNvbG9yICo9IGdhbW1hRGVjb2RlKGJhc2VDb2xvclNhbXBsZS5yZ2IpO1xcbiNlbmRpZlxcblxcbiAgICB2ZWMzIGRpZmZ1c2VDb2xvciA9IG1peChiYXNlQ29sb3IsIHZlYzMoMC4wKSwgbWV0YWxuZXNzKTtcXG4gICAgLy8gP1xcbiAgICB2ZWMzIHNwZWN1bGFyQ29sb3IgPSBtaXgodmVjMygwLjA0KSwgYmFzZUNvbG9yLnJnYiwgbWV0YWxuZXNzKSowLjU7XFxuXFxuI2lmZGVmIElTX1BPSU5UX0xJR0hUXFxuICAgIHZlYzMgbGlnaHRPZmZzZXQgPSB2UG9zaXRpb24gLSB1TGlnaHRQb3NpdGlvbjtcXG4gICAgbGlnaHRPZmZzZXQueSAvPSB1Vmlld3BvcnRBc3BlY3Q7XFxuICAgIGZsb2F0IGxpZ2h0RGlzdGFuY2UgPSBsZW5ndGgobGlnaHRPZmZzZXQpO1xcbiAgICBmbG9hdCBmYWxsb2ZmID0gYXR0ZW51YXRpb24obGlnaHREaXN0YW5jZSk7XFxuICAgIHZlYzMgbGlnaHREaXJlY3Rpb24gPSBsaWdodE9mZnNldC9saWdodERpc3RhbmNlO1xcbiNlbmRpZlxcblxcbiNpZmRlZiBJU19ESVJFQ1RJT05BTF9MSUdIVFxcbiAgICBmbG9hdCBmYWxsb2ZmID0gMS4wO1xcbiAgICB2ZWMzIGxpZ2h0RGlyZWN0aW9uID0gdUxpZ2h0RGlyZWN0aW9uO1xcbiNlbmRpZlxcblxcbiAgICB2ZWMzIGV5ZURpcmVjdGlvbiA9IG5vcm1hbGl6ZShleWUgLSB2UG9zaXRpb24pO1xcbiAgICB2ZWMzIGRpZmZ1c2UgPSBtYXgoMC4wLCAtZG90KGRpZmZ1c2VOb3JtYWwsIGxpZ2h0RGlyZWN0aW9uKSkqZGlmZnVzZUNvbG9yO1xcbiAgICAvLyBsaW5lYXIgPSB2ZWMzKHJvdWdobmVzcyk7XFxuICAgIHZlYzMgc3BlY3VsYXIgPSBicmRmX2dneChub3JtYWwsIC1saWdodERpcmVjdGlvbiwgZXllRGlyZWN0aW9uLCBzcGVjdWxhckNvbG9yLCByb3VnaG5lc3MpO1xcbiAgICB2ZWMzIGludGVuc2l0eSA9IChkaWZmdXNlK3NwZWN1bGFyKSpmYWxsb2ZmO1xcblxcbiNpZmRlZiBVU0VfTUFURVJJQUxfTUFQXFxuICAgIGludGVuc2l0eSAqPSBvY2NsdXNpb247XFxuI2VuZGlmXFxuXFxuICAgIHZlYzMgbGluZWFyID0gdUxpZ2h0Q29sb3IqaW50ZW5zaXR5O1xcbiAgICAvLyBsaW5lYXIgPSBzcGVjdWxhckNvbG9yO1xcbiAgICAvLyBsaW5lYXIuciA9IG1ldGFsbmVzcztcXG4gICAgLy8gbGluZWFyID0gdmVjMyh1Um91Z2huZXNzKm1hdGVyaWFsU2FtcGxlLmcgPT0gbWF0ZXJpYWxTYW1wbGUuZyA/IDEuMCA6IDAuMCk7XFxuICAgIC8vIGxpbmVhci5iID0gb2NjbHVzaW9uO1xcblxcbiAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGxpbmVhciwgYWxwaGEpO1xcblxcbiNpZmRlZiBVU0VfU0lOR0xFX1BBU1NcXG4gICAgZ2xfRnJhZ0NvbG9yID0gZ2FtbWFFbmNvZGUoZ2xfRnJhZ0NvbG9yKTtcXG4jaWZkZWYgVVNFX0FNQklFTlRfTUFQXFxuICAgYWRkQW1iaWVudChnbF9GcmFnQ29sb3IpO1xcbiNlbmRpZlxcbiNlbmRpZlxcblxcbn1cXG5cIjtcbiIsIm1vZHVsZS5leHBvcnRzID0gXCJwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XFxuI2luY2x1ZGUgXFxcImNvbW1vbi5nbHNsXFxcIlxcbiNpbmNsdWRlIFxcXCJmeGFhLmdsc2xcXFwiXFxuXFxudW5pZm9ybSBzYW1wbGVyMkQgdUZyYW1lQnVmZmVyU2FtcGxlcjtcXG51bmlmb3JtIHZlYzIgdUZyYW1lQnVmZmVyUmVzb2x1dGlvbjtcXG5cXG52YXJ5aW5nIHZlYzMgdlBvc2l0aW9uO1xcblxcbiNpZmRlZiBVU0VfQU1CSUVOVF9NQVBcXG52YXJ5aW5nIHZlYzIgdlV2O1xcbiNlbmRpZlxcblxcbiNpbmNsdWRlIFxcXCJhbWJpZW50Lmdsc2xcXFwiXFxuXFxudm9pZCBtYWluKCl7XFxuI2lmZGVmIFVTRV9GWEFBXFxuICAgIC8vIGZ4YWEgZG9lcyBnYW1tYUVuY29kZSAuLiBmb3Igbm93XFxuICAgIHZlYzQgZnJhbWVCdWZmZXIgPSBmeGFhKHZlYzIodlBvc2l0aW9uLngsIDEuMCAtIHZQb3NpdGlvbi55KSwgdUZyYW1lQnVmZmVyUmVzb2x1dGlvbiwgdUZyYW1lQnVmZmVyU2FtcGxlcik7XFxuI2VuZGlmXFxuI2lmbmRlZiBVU0VfRlhBQVxcbiAgICB2ZWM0IGZyYW1lQnVmZmVyID0gZ2FtbWFFbmNvZGUodGV4dHVyZTJEKHVGcmFtZUJ1ZmZlclNhbXBsZXIsIHZlYzIodlBvc2l0aW9uLngsIDEuMCAtIHZQb3NpdGlvbi55KSkpO1xcbiNlbmRpZlxcbiAgICBnbF9GcmFnQ29sb3IgPSBmcmFtZUJ1ZmZlcjtcXG4vLyBhc3N1bWUgU1JHQlxcbiNpZmRlZiBVU0VfQU1CSUVOVF9NQVBcXG4gICBhZGRBbWJpZW50KGdsX0ZyYWdDb2xvcik7XFxuI2VuZGlmXFxufVxcblwiO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBcImF0dHJpYnV0ZSB2ZWMzIGFQb3NpdGlvbjtcXG4jaWZkZWYgVVNFX0FNQklFTlRfTUFQXFxudmFyeWluZyB2ZWMyIHZVdjtcXG4jZW5kaWZcXG5cXG52b2lkIG1haW4oKXtcXG4gICAgdlV2ID0gdmVjMigwLjUpLShhUG9zaXRpb24ueHkpKnZlYzIoLTAuNSwgMC41KTtcXG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KGFQb3NpdGlvbiwgMS4wKTtcXG59XFxuXCI7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFwiYXR0cmlidXRlIHZlYzMgYVBvc2l0aW9uO1xcblxcbnVuaWZvcm0gZmxvYXQgdVNjYWxlO1xcbnVuaWZvcm0gZmxvYXQgdVRleHR1cmVBc3BlY3Q7XFxuXFxudmFyeWluZyB2ZWMyIHZVdjtcXG52YXJ5aW5nIHZlYzMgdlBvc2l0aW9uO1xcblxcbnZvaWQgbWFpbigpe1xcbiAgICB2UG9zaXRpb24gPSB2ZWMzKHZlYzIoMC41KS0oYVBvc2l0aW9uLnh5KSp2ZWMyKC0wLjUsIDAuNSksIDApO1xcbiAgICB2VXYgPSB2UG9zaXRpb24ueHkgKiB1U2NhbGUgKiB2ZWMyKDEuMCwgMS4wL3VUZXh0dXJlQXNwZWN0KTtcXG4gICAgZ2xfUG9zaXRpb24gPSB2ZWM0KGFQb3NpdGlvbiwgMS4wKTtcXG59XFxuXCI7XG4iXX0=
