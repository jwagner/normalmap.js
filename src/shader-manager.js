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
