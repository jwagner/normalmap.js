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
