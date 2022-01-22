const fs = require("fs");
const glob = require("glob");
const path = require("path");
const jsesc = require("jsesc");
const globParent = require("glob-parent");
const { validate } = require("schema-utils");
const webpack = require("webpack");
const lodashTemplate = require('lodash.template');

const schema = {
    "type": "object",
    "properties": {
        "source": {
            "anyOf": [
                {
                    "type": "string",
                    "minLength": 1
                },
                {
                    "type": "array",
                    "minItems": 1,
                },
            ]
        },
        "root": {
            "type": "string",
            "minLength": 1
        },
        "outputFilename": {
            "type": "string"
        },
        "module": {
            "type": "string"
        },
        "templateHeader": {
            "type": "string"
        },
        "templateBody": {
            "type": "string"
        },
        "templateFooter": {
            "type": "string"
        },
        "escapeOptions": {
            "type": "object"
        },
        "standalone": {
            "type": "boolean"
        }
    },
    "additionalProperties": false
};

class AngularTemplateCacheWebpackPlugin {

    constructor(options) {
        validate(schema, options, { name: 'AngularTemplateCacheWebpackPlugin' });

        const TEMPLATE_HEADER = 'angular.module(\'<%= module %>\'<%= standalone %>).run([\'$templateCache\', function($templateCache) {';
        const TEMPLATE_BODY = '$templateCache.put(\'<%= url %>\',\'<%= contents %>\');';
        const TEMPLATE_FOOTER = '}]);';
        const DEFAULT_FILENAME = 'templates.js';
        const DEFAULT_MODULE = 'templates';

        const userOptions = options || {};

        const defaultOptions = {
            source: userOptions.source === undefined ? '' : userOptions.source,
            root: userOptions.root === undefined ? '' : userOptions.root,
            outputFilename: userOptions.outputFilename === undefined ? DEFAULT_FILENAME : userOptions.outputFilename,
            module: userOptions.module === undefined ? DEFAULT_MODULE : userOptions.module,
            templateHeader: userOptions.templateHeader === undefined ? TEMPLATE_HEADER : userOptions.templateHeader,
            templateBody: userOptions.templateBody === undefined ? TEMPLATE_BODY : userOptions.templateBody,
            templateFooter: userOptions.templateFooter === undefined ? TEMPLATE_FOOTER : userOptions.templateFooter,
            escapeOptions: userOptions.escapeOptions === undefined ? {} : userOptions.escapeOptions,
            standalone: !!userOptions.standalone,
        };

        this.options = Object.assign(defaultOptions, userOptions);

        this.init();
    }

    apply(compiler) {

        const outputNormal = {};

        compiler.hooks.thisCompilation.tap('AngularTemplateCacheWebpackPlugin', (compilation) => {
            this.files.forEach(f => compilation.fileDependencies.add(path.join(compiler.context, f)));
            compilation.hooks.additionalAssets.tapAsync('AngularTemplateCacheWebpackPlugin', (cb) => {
                this.processTemplates();

                const dest = compiler.options.output.path;
                const outputPath = path.resolve(
                    dest,
                    this.options.outputFilename
                );
                let cachedTemplates = '';

                this.templatelist.forEach((template) => {
                    cachedTemplates += template + '\n';

                });

                outputNormal[outputPath] = {
                    filename: this.options.outputFilename,
                    content: cachedTemplates,
                    size: cachedTemplates.length
                };
                for (const [key, value] of Object.entries(outputNormal)) {
                    compilation.emitAsset(
                        value.filename,
                        new webpack.sources.RawSource(value.content),
                    );
                }
                cb();
            });

        });
    }

    init() {
        this.files = typeof this.options.source === 'string'
            ? glob.sync(this.options.source)
            : this.options.source;

        this.templateBody = this.options.templateBody;
        this.templateHeader = this.options.templateHeader;
        this.templateFooter = this.options.templateFooter;
    }

    processTemplates() {
        this.templatelist = [];
        this.processHeader();
        this.processBody();
        this.processFooter();
    }

    processHeader() {
        let header = lodashTemplate(this.templateHeader)({
            module: this.options.module,
            standalone: this.options.standalone ? ', []' : ''
        });
        this.templatelist.unshift(header);
    }

    processBody() {
        this.files.forEach((file) => {
            let tpl = {};
            tpl.source = fs.readFileSync(file);

            let htmlRootDir = globParent(this.options.source);
            let filename = path.posix.relative(htmlRootDir, file);

            let url = path.posix.join(this.options.root, filename);
            if (this.options.root === '.' || this.options.root.indexOf('./') === 0) {
                url = './' + url;
            }

            tpl.source = lodashTemplate(this.templateBody)({
                url: url,
                contents: jsesc(tpl.source.toString('utf8'), this.options.escapeOptions),
                file: file
            });

            this.templatelist.push(tpl.source);
        });
    }

    processFooter() {
        this.templatelist.push(this.templateFooter);
    }
}

module.exports = AngularTemplateCacheWebpackPlugin;
