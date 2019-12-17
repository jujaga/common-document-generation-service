const log = require('npmlog');
const carbone = require('carbone');
const stream = require('stream');
const tmp = require('tmp');
const fs = require('fs');
const utils = require('./utils');

const docGen = {
  /** Generate a file using carbone to merge data into the supplied document template
   *  @param {object} body The request body
   *  @param {object} response The server response to write the generated file to
   */
  generateDocument: async (body, response) => {
    tmp.setGracefulCleanup();
    let tmpFile = undefined;
    try {
      tmpFile = tmp.fileSync();
      if (!body.template.contentEncodingType) {
        body.template.contentEncodingType = 'base64';
      }

      // Put the actual extension from the supplied file onto the tmp filename
      const inboundFileExtension = utils.getFileExtension(body.template.filename);
      const tmpFilename = inboundFileExtension ? `${tmpFile.name}.${inboundFileExtension}` : tmpFile.name;
      log.debug('generateDocument', 'Filename: ' + tmpFilename);

      await fs.promises.writeFile(tmpFilename, Buffer.from(body.template.content, body.template.contentEncodingType));
      log.debug('generateDocument', JSON.stringify(tmpFile));

      // Set options
      const options = {
        reportName: body.template.filename
      };

      // Only supporting pdf conversion at the moment
      if (inboundFileExtension && inboundFileExtension.toUpperCase() === 'PDF') {
        log.debug('setting pdf generation option');
        options.convertTo = 'pdf';
      }

      // If it's not an array of multiple data items, pass it into carbone as a singular object
      const data = body.contexts.length > 1 ? body.contexts : body.contexts[0];

      // TODO: there's too much response stuff down here in a component layer, figure out how
      // better to have the asynchronous carbone render be blocking and wait for its response
      // up in the v1/docGen.js route layer, then handle response setting there.
      carbone.render(tmpFilename, data, options, (err, result, reportName) => {
        if (err) {
          const errTxt = `Error during Carbone generation. Error: ${err}`;
          log.error('generateDocument', errTxt);
          response.status(500).send(errTxt);
        } else {
          log.debug('generateDocument', `generated filename ${reportName}`);

          // write the result
          var readStream = new stream.PassThrough();
          readStream.end(result);

          response.status(201);
          response.set('Content-Disposition', `attachment; filename=${reportName}`);
          if (inboundFileExtension && inboundFileExtension.toUpperCase() === 'PDF') {
            response.set('Content-Type', 'application/pdf');
          } else {
            response.set('Content-Type', 'text/plain');
          }

          readStream.pipe(response);
          // Doc is generated at this point, remove the input file
          tmpFile.removeCallback();
        }
      });
    } catch (e) {
      // something wrong (disk i/o?), log out and REMOVE THE TEMP FILE
      log.error(`Error handling file. ${e.message}`);
      if (tmpFile) {
        tmpFile.removeCallback();
      }
      throw e;
    }
  }
};

module.exports = docGen;
