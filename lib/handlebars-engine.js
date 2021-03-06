var fs         = require('fs'),
    fsPath     = require('path'),
    glob       = require('glob'),
    handlebars = require('handlebars'),

    cache = {},

    // Hacky. Shouldn't rely on hardcoded view directory, but whatevs.
    viewPath = __dirname + '/../views';

// In production mode, partials are registered at startup and then never again.
// In development mode, we'll re-register partials each time a view is
// rendered.
registerPartials();

function registerPartials() {
    var partials = glob.sync('**/*.{handlebars,hbs}', {
            cwd: viewPath + '/partials'
        });

    partials.forEach(function (filename) {
        var content = fs.readFileSync(viewPath + '/partials/' + filename, 'utf8');
        handlebars.registerPartial(filename.replace(/\.[^\.]+$/, ''), content);
    });
}

function renderFile(path, options, callback) {
    var template = cache[path];

    if (options.cache && template) {
        return callback(null, template(options));
    }

    fs.readFile(path, 'utf8', function (err, contents) {
        if (err) {
            return callback(err);
        }

        var template;

        options.filename = path;

        try {
            template = handlebars.compile(contents, options);
        } catch (ex) {
            return callback(ex);
        }

        if (options.cache) {
            cache[path] = template;
        }

        callback(null, template(options));
    });
}

function renderWithLayout(layout, path, options, callback) {
    renderFile(path, options, function (err, result) {
        if (err) {
            return callback(err);
        }

        options.body = result;
        callback(null, layout(options));
    });
}

module.exports = function (path, options, callback) {
    // If caching is disabled, re-register partials.
    if (!options.cache) {
        registerPartials();
    }

    if (options.layout === false) {
        // Don't use a layout.
        return renderFile(path, options, callback);
    }

    if (options.layout && !/\.handlebars$/.test(options.layout)) {
        options.layout += '.handlebars';
    }

    var layoutPath = fsPath.join(options.settings.views, 'layouts', options.layout || 'default.handlebars');
    var layout     = cache[layoutPath];

    if (layout) {
        return renderWithLayout(layout, path, options, callback);
    }

    fs.readFile(layoutPath, 'utf8', function (err, contents) {
        if (err) {
            return callback(err);
        }

        var layout;

        options.filename = layoutPath;

        try {
            layout = handlebars.compile(contents, options);
        } catch (ex) {
            return callback(ex);
        }

        if (options.cache) {
            cache[layoutPath] = layout;
        }

        renderWithLayout(layout, path, options, callback);
    });
};

exports.registerHelper = function () {
    handlebars.registerHelper.apply(handlebars, arguments);
};

exports.registerPartial = function () {
    handlebars.registerPartial.apply(handlebars, arguments);
};
