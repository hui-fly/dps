const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { log, getAgrType, Spinner, calcText, genArgs } = require('./utils');
const ppteer = require('./pp');
const defaultHtml = require('./default.html');
const evalScripts = require('../evalDOM');

const currDir = process.cwd();

class DrawPageStructure {
    constructor({
        url,
        output = {},
        background,
        animation,
        rootNode,
        header,
        device,
        headless,
        extraHTTPHeaders,
        writePageStructure,
        includeElement,
        init
    } = {}) {
        let filepath = !output.filepath || path.isAbsolute(output.filepath) ? output.filepath : path.join(currDir, output.filepath);
        this.url = url;
        this.filepath = filepath;
        this.injectSelector = output.injectSelector || 'body';
        this.background = background || '#ecf0f2';
        this.animation = animation || '';
        this.rootNode = rootNode || '';
        this.header = header || '';
        this.device = device;
        this.headless = headless;
        this.extraHTTPHeaders = extraHTTPHeaders;
        this.writePageStructure = writePageStructure;
        this.includeElement = includeElement || function () { };
        this.init = init || function () { };

        if (this.headless === undefined) this.headless = true;

        if (!url) {
            log.error('please provide entry url !', 1);
        }
        // if(!output.filepath) {
        //   log.error('please provide output filepath !', 1); 
        // }
        if (header && getAgrType(header) !== 'object') {
            log.error('[header] should be an object !', 1);
        }

        if (filepath) {
            if (!fs.existsSync(filepath)) {
                log.error('[output.filepath:404] please provide the output filepath !', 1);
            } else {
                const fileStat = fs.statSync(filepath);
                if (fileStat.isDirectory()) {       // 如果output.filepath是一个文件夹，就在该文件夹下创建html文件，并写入defaultHtml
                    filepath = path.join(filepath, 'index.html');
                    fs.writeFileSync(filepath, defaultHtml);
                    this.filepath = filepath;
                }
            }
        }
    }
    async generateSkeletonHTML(page) {
        let html = '';
        try {
            // html = await page.evaluate.call(
            //   page, 
            //   evalScripts, 
            //   this.init.toString(), 
            //   this.includeElement.toString(), 
            //   this.background, 
            //   this.animation,
            //   this.rootNode,
            //   this.header
            // );
            const agrs = genArgs.create({
                init: {
                    type: 'function',
                    value: this.init.toString()
                },
                includeElement: {
                    type: 'function',
                    value: this.includeElement.toString()
                },
                background: {
                    type: 'string',
                    value: this.background
                },
                animation: {
                    type: 'string',
                    value: this.animation
                },
                rootNode: {
                    type: 'string',
                    value: this.rootNode
                },
                header: {
                    type: 'object',
                    value: JSON.stringify(this.header)
                }
            });
            html = await page.evaluate.apply(page, [evalScripts, ...agrs]);  // evaluate用于在浏览器环境执行脚本，用法：page.evaluate(function, arguments)
        } catch (e) {
            log.error('\n[page.evaluate] ' + e.message);
        }
        // await page.screenshot({path: 'example.png'});
        // let base64 = fs.readFileSync(path.resolve(currDir, '../example.png')).toString('base64');
        return html;

    }
    writeToFilepath(filepath, html) {
        let fileHTML = fs.readFileSync(filepath);
        let $ = cheerio.load(fileHTML, { // cheerio可以理解为一个Node.js版本的jquery，用来从网页中以 css selector取数据，使用方式和jquery基本相同。load方法用于装载dom
            decodeEntities: false
        });
        $(this.injectSelector).html(html);
        fs.writeFileSync(filepath, $.html('html'));
    }
    async start() {
        const pageUrl = this.url;
        const spinner = Spinner('magentaBright');

        spinner.text = '启动浏览器...';
        const pp = await ppteer({
            device: this.device,
            headless: this.headless
        });

        spinner.text = `正在打开页面：${pageUrl}...`;
        const page = await pp.openPage(pageUrl, this.extraHTTPHeaders);

        spinner.text = '正在生成骨架屏...';
        const html = await this.generateSkeletonHTML(page);
        const userWrite = getAgrType(this.writePageStructure) === 'function';

        if (userWrite) {
            this.writePageStructure(html, this.filepath);     // 自己处理生成的骨架屏
        }

        if (this.filepath) {
            this.writeToFilepath(this.filepath, html);
        }

        if (!userWrite && !this.filepath) {
            const defaultPage = path.join(currDir, 'index.html');
            fs.writeFileSync(defaultPage, defaultHtml);
            this.writeToFilepath(defaultPage, html);
            this.filepath = defaultPage;
            spinner.clear();
            log.warn(`\nskeleton has created in a default page: ${defaultPage}`);
        }

        spinner.clear().succeed(`skeleton screen has created and output to ${calcText(this.filepath)}002`);

        if (this.headless) {
            await pp.browser.close();
            process.exit(0);
        }
    }
}

module.exports = DrawPageStructure;
