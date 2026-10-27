/* Small JSON reader for persisted document metadata. Never evaluates document text as JavaScript. */
var BytebaseJSONRead=(function(){
  return function(source){var i=0,s=String(source);if(s.length>5000000)throw Error('Production metadata too large');
    function ws(){while(/\s/.test(s.charAt(i))&&i<s.length)i++;}
    function string(){var out='';i++;while(i<s.length){var c=s.charAt(i++);if(c==='"')return out;if(c==='\\'){c=s.charAt(i++);var escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(c==='u'){var h=s.substr(i,4);if(!/^[0-9a-f]{4}$/i.test(h))throw Error('Invalid JSON escape');out+=String.fromCharCode(parseInt(h,16));i+=4;}else if(escapes.hasOwnProperty(c))out+=escapes[c];else throw Error('Invalid JSON escape');}else{if(c.charCodeAt(0)<32)throw Error('Invalid JSON string');out+=c;}}throw Error('Unclosed JSON string');}
    function value(depth){if(depth>100)throw Error('Metadata nesting limit');ws();var c=s.charAt(i),out,key;if(c==='"')return string();if(c==='['||c==='{'){var object=c==='{',end=object?'}':']';out=object?{}:[];i++;ws();if(s.charAt(i)===end){i++;return out;}while(i<s.length){if(object){if(s.charAt(i)!=='"')throw Error('Invalid JSON key');key=string();if(key==='__proto__'||key==='constructor'||key==='prototype')throw Error('Unsafe JSON property');ws();if(s.charAt(i++)!==':')throw Error('Invalid JSON object');out[key]=value(depth+1);}else out.push(value(depth+1));ws();c=s.charAt(i++);if(c===end)return out;if(c!==',')throw Error('Invalid JSON delimiter');ws();}throw Error('Unclosed JSON value');}
      var tail=s.substr(i),m=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(tail);if(m){i+=m[0].length;var n=Number(m[0]);if(!isFinite(n))throw Error('Invalid JSON number');return n;}if(tail.substr(0,4)==='true'){i+=4;return true;}if(tail.substr(0,5)==='false'){i+=5;return false;}if(tail.substr(0,4)==='null'){i+=4;return null;}throw Error('Invalid JSON value');}
    var result=value(0);ws();if(i!==s.length)throw Error('Unexpected JSON content');return result;
  };
}());
if(typeof module==='object'&&module.exports)module.exports=BytebaseJSONRead;
