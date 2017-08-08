"use strict";

var root = (typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global) || this;

(function( global ) {
  
  var encoder;
  var _ = require('lodash');

  global['onmessage'] = function( e ){
    switch( e['data']['command'] ){

      case 'encode':
        if (encoder) {
          encoder.record( e['data']['buffers'] );
        }
        break;

      case 'done':
        if (encoder) {
          encoder.requestData();
        }
        break;

      case 'init':
        encoder = new WavePCM( e['data'] );
        break;

      default:
        // Ignore any unknown commands and continue recieving commands
    }
  };

  var WavePCM = function( config ){

    if ( !config['wavSampleRate'] ) {
      throw new Error("wavSampleRate value is required to record. NOTE: Audio is not resampled!");
    }

    this.bitDepth = config['wavBitDepth'] || 16;
    if ( !_.includes( [8, 16, 24, 32]), this.bitDepth ) {
      throw new Error("Only 8, 16, 24 and 32 bits per sample are supported");
    }

    this.sampleRate = config['wavSampleRate']; 
    this.recordedBuffers = [];
    this.bytesPerSample = this.bitDepth / 8;
  };

  WavePCM.prototype.record = function( buffers ){
    this.numberOfChannels = this.numberOfChannels || buffers.length;
    var bufferLength = buffers[0].length;
    var reducedData = new Uint8Array( bufferLength * this.numberOfChannels * this.bytesPerSample );

    // Interleave
    for ( var i = 0; i < bufferLength; i++ ) {
      for ( var channel = 0; channel < this.numberOfChannels; channel++ ) {

        var outputIndex = ( i * this.numberOfChannels + channel ) * this.bytesPerSample;
        var sample = buffers[ channel ][ i ];

        // Check for clipping
        if ( sample > 1 ) {
          sample = 1;
        }

        else if ( sample < -1 ) {
          sample = -1;
        }

        // bit reduce and convert to uInt
        switch ( this.bytesPerSample ) {
          case 4:
            sample = sample * 2147483648;
            reducedData[ outputIndex ] = sample;
            reducedData[ outputIndex + 1 ] = sample >> 8;
            reducedData[ outputIndex + 2 ] = sample >> 16;
            reducedData[ outputIndex + 3 ] = sample >> 24;
            break;

          case 3:
            sample = sample * 8388608;
            reducedData[ outputIndex ] = sample;
            reducedData[ outputIndex + 1 ] = sample >> 8;
            reducedData[ outputIndex + 2 ] = sample >> 16;
            break;

          case 2:
            sample = sample * 32768;
            reducedData[ outputIndex ] = sample;
            reducedData[ outputIndex + 1 ] = sample >> 8;
            break;

          case 1:
            reducedData[ outputIndex ] = ( sample + 1 ) * 128;
            break;

          default:
            throw new Error("Only 8, 16, 24 and 32 bits per sample are supported");
        }
      }
    }

    this.recordedBuffers.push( reducedData );
  };

  WavePCM.prototype.requestData = function(){
    var bufferLength = this.recordedBuffers[0].length;
    var dataLength = this.recordedBuffers.length * bufferLength;
    var headerLength = 44;
    var wav = new Uint8Array( headerLength + dataLength );
    var view = new DataView( wav.buffer );

    view.setUint32( 0, 1380533830, false ); // RIFF identifier 'RIFF'
    view.setUint32( 4, 36 + dataLength, true ); // file length minus RIFF identifier length and file description length
    view.setUint32( 8, 1463899717, false ); // RIFF type 'WAVE'
    view.setUint32( 12, 1718449184, false ); // format chunk identifier 'fmt '
    view.setUint32( 16, 16, true ); // format chunk length
    view.setUint16( 20, 1, true ); // sample format (raw)
    view.setUint16( 22, this.numberOfChannels, true ); // channel count
    view.setUint32( 24, this.sampleRate, true ); // sample rate
    view.setUint32( 28, this.sampleRate * this.bytesPerSample * this.numberOfChannels, true ); // byte rate (sample rate * block align)
    view.setUint16( 32, this.bytesPerSample * this.numberOfChannels, true ); // block align (channel count * bytes per sample)
    view.setUint16( 34, this.bitDepth, true ); // bits per sample
    view.setUint32( 36, 1684108385, false); // data chunk identifier 'data'
    view.setUint32( 40, dataLength, true ); // data chunk length

    for (var i = 0; i < this.recordedBuffers.length; i++ ) {
      wav.set( this.recordedBuffers[i], i * bufferLength + headerLength );
    }

    global['postMessage']( wav, [wav.buffer] );
    global['postMessage'](null);
    global['close']();
  };

  // Exports for unit testing
  global.WavePCM = WavePCM;

  if ( typeof module == 'object' && module.exports ) {
    module.exports = WavePCM
  }
})(root);
