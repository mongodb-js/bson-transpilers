const {
  BsonTranspilersAttributeError,
  BsonTranspilersArgumentError,
  BsonTranspilersInternalError,
  BsonTranspilersReferenceError,
  BsonTranspilersTypeError,
  BsonTranspilersUnimplementedError
} = require('../helper/error');

/**
 * Class for code generation. Goes in between ANTLR generated visitor and
 * language-specific visitor code. These are basically all helper methods
 * that are used for all input languages.
 *
 * @param {ANTLRVisitor} ANTLRVisitor - An ANTLR-generated visitor class
 * @returns {CodeGenerationVisitor}
 */
module.exports = (ANTLRVisitor) => class CodeGenerationVisitor extends ANTLRVisitor {
  constructor() {
    super();
    this.idiomatic = true; // PUBLIC
    this.requiredImports = {};
  }

  /**
   * PUBLIC: This is the entry point for the compiler. Each visitor must define
   * an attribute called "startNode".
   *
   * @param {ParserRuleContext} ctx
   * @return {String}
   */
  start(ctx) {
    const rule = `visit${this.startRule.replace(/^\w/, c => c.toUpperCase())}`;
    if (!this.startRule || !(rule in this)) {
      throw new BsonTranspilersInternalError(
        'Unimplemented Visitor: the entry rule for the compiler must be set'
      );
    }
    this.requiredImports = {};
    [300, 301, 302, 303, 304, 305, 306].forEach(
      (i) => (this.requiredImports[i] = [])
    );
    return this[rule](ctx).trim();
  }

  /**
   * PUBLIC: As code is generated, any classes that require imports are tracked
   * in this.Imports. Each class has a "code" defined in the symbol table.
   * The imports are then generated based on the output language templates.
   *
   *  @return {String} - The list of imports in the target language.
   */
  getImports() {
    const importTemplate = this.Imports.import.template ?
      this.Imports.import.template :
      (s) => (
        Object.values(s)
          .filter((a, i) => (Object.values(s).indexOf(a) === i))
          .join('\n')
      );
    // Remove empty arrays because js [] is not falsey :(
    [300, 301, 302, 303, 304, 305, 306].forEach(
      (i) => {
        if (i in this.requiredImports && this.requiredImports[i].length === 0) {
          this.requiredImports[i] = false;
        }
      });
    const imports = Object.keys(this.requiredImports)
      .filter((code) => {
        return (
          this.requiredImports[code] &&
          this.Imports[code] &&
          this.Imports[code].template
        );
      })
      .reduce((obj, c) => {
        obj[c] = this.Imports[c].template(this.requiredImports[c]);
        return obj;
      }, {});
    return importTemplate(imports);
  }

  /**
   * Used by the generators. Makes a copy of the required imports so
   * can be rolled back after a recursion if needed.
   *
   * @return {Object}
   */
  deepCopyRequiredImports() {
    const copy = Object.assign({}, this.requiredImports);
    [300, 301, 302, 303, 304, 305, 306].forEach((i) => {
      copy[i] = Array.from(this.requiredImports[i]);
    });
    return copy;
  }

  /**
   * If the compiler reaches a expression in the input language
   * that is not implemented yet.
   *
   * @param {ParserRuleContext} ctx
   */
  unimplemented(ctx) {
    const name = this.renameNode(ctx.constructor.name);
    throw new BsonTranspilersUnimplementedError(
      `'${name}' not yet implemented`
    );
  }

  _getType(ctx) {
    if (ctx.type !== undefined) {
      return ctx;
    }
    if (!ctx.children) {
      return null;
    }
    for (const c of ctx.children) {
      const typed = this._getType(c);
      if (typed) {
        return typed;
      }
    }
    return null;
  }

  /**
   * Recursively descend down the tree looking for a node with the type set.
   * Returns the first child node with a type set.
   *
   * @param {ParserRuleContext} ctx
   * @return {ParserRuleContext}
   */
  findTypedNode(ctx) {
    const typed = this._getType(ctx);
    if (!typed) {
      throw new BsonTranspilersInternalError('Type not set on any child nodes');
    }
    return typed;
  }


  /**
   * Validate each argument against the expected argument types defined in the
   * Symbol table.
   *
   * @param {Array} expected - An array of arrays where each subarray represents
   * possible argument types for that index.
   * @param {Array} args - empty if no args.
   * @param {String} name - The name of the function for error reporting.
   *
   * @returns {Array} - Array containing the generated output for each argument.
   */
  checkArguments(expected, args, name) {
    const argStr = [];
    if (args.length === 0) {
      if (expected.length === 0 || expected[0].indexOf(null) !== -1) {
        return argStr;
      }
      throw new BsonTranspilersArgumentError(
        `Argument count mismatch: '${name}' requires least one argument`
      );
    }
    if (args.length > expected.length) {
      throw new BsonTranspilersArgumentError(
        `Argument count mismatch: '${name}' expects ${expected.length} args and got ${args.length}`
      );
    }
    for (let i = 0; i < expected.length; i++) {
      if (args[i] === undefined) {
        if (expected[i].indexOf(null) !== -1) {
          return argStr;
        }
        throw new BsonTranspilersArgumentError(
          `Argument count mismatch: too few arguments passed to '${name}'`
        );
      }
      const result = this.castType(expected[i], args[i]);
      if (result === null) {
        const typeStr = expected[i].map((e) => {
          const id = e && e.id ? e.id : e;
          return e ? id : '[optional]';
        }).join(', ');
        const message = `Argument type mismatch: '${name}' expects types ${
          typeStr} but got type ${this.findTypedNode(args[i]).type.id} for argument at index ${i}`;

        throw new BsonTranspilersArgumentError(message);
      }
      argStr.push(result);
    }
    return argStr;
  }

  /**
   * Generate a function call, diverting to process or emit methods if they
   * exist.
   * @param {ParserRuleContext} ctx
   * @return {String}
   */
  generateFunctionCall(ctx) {
    const funcNameNode = this.getFunctionCallName(ctx);
    const lhs = this.visit(funcNameNode);
    let lhsType = this.findTypedNode(funcNameNode).type;
    if (typeof lhsType === 'string') {
      lhsType = this.Types[lhsType];
    }

    // Special case
    if (`process${lhsType.id}` in this) {
      return this[`process${lhsType.id}`](ctx);
    }
    if (`emit${lhsType.id}` in this) {
      return this[`emit${lhsType.id}`](ctx);
    }

    // Check if left-hand-side is callable
    ctx.type = lhsType.type;
    if (!lhsType.callable) {
      throw new BsonTranspilersTypeError(`${lhsType.id} is not callable`);
    }

    // Check arguments
    const expectedArgs = lhsType.args;
    let rhs = this.checkArguments(
      expectedArgs, this.getArguments(ctx), lhsType.id
    );

    // Apply the arguments template
    if (lhsType.argsTemplate) {
      const l = this.visit(this.getIfIdentifier(funcNameNode));
      rhs = lhsType.argsTemplate(l, ...rhs);
    } else {
      rhs = `(${rhs.join(', ')})`;
    }
    const expr = `${lhs}${rhs}`;
    const constructor = lhsType.callable === this.SYMBOL_TYPE.CONSTRUCTOR;

    return this.Syntax.new.template
      ? this.Syntax.new.template(expr, !constructor, lhsType.code)
      : expr;
  }

  /**
   * Visit a symbol and error if undefined. Otherwise check symbol table and
   * replace if template exists.
   *
   * @param {ParserRuleContext} ctx
   * @return {String}
   */
  generateIdentifier(ctx) {
    const name = this.visitChildren(ctx);
    ctx.type = this.Symbols[name];
    if (ctx.type === undefined) {
      throw new BsonTranspilersReferenceError(`Symbol '${name}' is undefined`);
    }
    this.requiredImports[ctx.type.code] = true;

    if (ctx.type.template) {
      return ctx.type.template();
    }
    return name;
  }

  /**
   * Generate attribute access. Visitors are in charge of making sure that
   * if lhs type attribute access is not supported, an error is thrown.
   *
   * NOTE: If the attribute isn't defined on the lhsType, then it will check the
   * lhsType.type to see if defined. It will loop, checking the lhs type's type,
   * until the attribute exists or the .type is null. If the type is null,
   * and the class is a BSON class, then error. If it is a native type however,
   * do not error and just return the original attribute. This is to not annoy
   * people with attribute errors in languages where it wouldn't throw anyway.
   * It feels better to be strict about BSON than the whole language, but it's
   * up for debate. TODO: could set type checking to 'strict' or 'non-strict' in
   * the visitor, and then only error if we are compiling from a strictly typed
   * langauge.
   *
   * @param {ParserRuleContext} ctx
   * @return {String}
   */
  generateAttributeAccess(ctx) {
    const lhsNode = this.getAttributeLHS(ctx);
    const lhs = this.visit(lhsNode);
    const rhs = this.getAttributeRHS(ctx).getText();

    let type = this.findTypedNode(lhsNode).type;
    if (typeof type === 'string') {
      type = this.Types[type];
    }
    while (type !== null) {
      if (!(type.attr.hasOwnProperty(rhs))) {
        if (type.id in this.BsonTypes && this.BsonTypes[type.id].id !== null) {
          throw new BsonTranspilersAttributeError(
            `'${rhs}' not an attribute of ${type.id}`
          );
        }
        type = type.type;
        if (typeof type === 'string') {
          type = this.Types[type];
        }
      } else {
        break;
      }
    }
    if (type === null) {
      ctx.type = this.Types._undefined;
      // TODO: how strict do we want to be?
      return `${lhs}.${rhs}`;
    }
    ctx.type = type.attr[rhs];
    if (type.attr[rhs].template) {
      return type.attr[rhs].template(lhs, rhs);
    }

    return `${lhs}.${rhs}`;
  }

  /**
   * This helper function checks for an emit method then applies the templates
   * if they exist for a function call node. Used primarily by process methods.
   *
   * @param {ParserRuleContext} ctx - The function call node
   * @param {Object} lhsType - The type
   * @param {Array} args - Arguments to the template
   * @param {String} defaultT - The default name if no template exists.
   * @param {String} defaultA - The default arguments if no argsTemplate exists.
   * @param {Boolean} skipNew - Optional: If true, never add new.
   * @param {Boolean} skipLhs - Optional: If true, don't add lhs to result.
   *
   * @return {String}
   */
  generateCall(ctx, lhsType, args, defaultT, defaultA, skipNew, skipLhs) {
    if (`emit${lhsType.id}` in this) {
      return this[`emit${lhsType.id}`](ctx);
    }
    const lhsArg = lhsType.template ? lhsType.template() : defaultT;
    const rhs = lhsType.argsTemplate ? lhsType.argsTemplate(lhsArg, ...args) : defaultA;
    const lhs = skipLhs ? '' : lhsArg;
    return this.Syntax.new.template
      ? this.Syntax.new.template(`${lhs}${rhs}`, skipNew, lhsType.code)
      : `${lhs}${rhs}`;
  }

  generateObjectLiteral(ctx) {
    if (this.idiomatic && 'emitIdiomaticObjectLiteral' in this) {
      return this.emitIdiomaticObjectLiteral(ctx);
    }
    this.requiredImports[10] = true;
    ctx.type = this.Types._object;
    ctx.indentDepth = this.getIndentDepth(ctx) + 1;
    let args = '';
    const keysAndValues = this.getKeyValueList(ctx);
    if (ctx.type.argsTemplate) {
      args = ctx.type.argsTemplate(
        this.getKeyValueList(ctx).map((k) => {
          return [this.getKeyStr(k), this.visit(this.getValue(k))];
        }),
        ctx.indentDepth);
    } else {
      args = this.visit(keysAndValues);
    }
    ctx.indentDepth--;
    if (ctx.type.template) {
      return ctx.type.template(args, ctx.indentDepth);
    }
    return this.visitChildren(ctx);
  }

  generateArrayLiteral(ctx) {
    ctx.type = this.Types._array;
    ctx.indentDepth = this.getIndentDepth(ctx) + 1;
    this.requiredImports[9] = true;
    let args = '';
    const list = this.getList(ctx);
    const visitedElements = list.map((child) => ( this.visit(child) ));
    if (ctx.type.argsTemplate) { // NOTE: not currently being used anywhere.
      args = visitedElements.map((arg, index) => {
        const last = !visitedElements[index + 1];
        return ctx.type.argsTemplate(arg, ctx.indentDepth, last);
      }).join('');
    } else {
      args = visitedElements.join(', ');
    }
    if (ctx.type.template) {
      return ctx.type.template(args, ctx.indentDepth);
    }
    return this.visitChildren(ctx);
  }

  /**
   * Called from the process methods of numeric class constructors.
   * We know there will be a single (sometimes optional) argument that is
   * a number or string.
   *
   * Required because we want to pass the argument type to the template
   * so that we can determine if the generated number needs to be parsed or
   * casted.
   *
   * @param {ParserRuleContext} ctx
   * @returns {String}
   */
  generateNumericClass(ctx) {
    const funcNameNode = this.getFunctionCallName(ctx);
    const lhsStr = this.visit(funcNameNode);
    let lhsType = this.findTypedNode(funcNameNode).type;
    if (typeof lhsType === 'string') {
      lhsType = this.Types[lhsType];
    }
    ctx.type = lhsType.type;

    // Get the original type of the argument
    const expectedArgs = lhsType.args;
    let args = this.checkArguments(
      expectedArgs, this.getArguments(ctx), lhsType.id
    );
    let argType;

    if (args.length === 0) {
      args = ['0'];
      argType = this.Types._integer;
    } else {
      const argNode = this.getArgumentAt(ctx, 0);
      const typed = this.findTypedNode(argNode);
      argType = typed.originalType !== undefined ?
        typed.originalType :
        typed.type;
    }

    return this.generateCall(
      ctx, lhsType, [args[0], argType.id], lhsStr, `(${args.join(', ')})`
    );
  }

  /**
   * Same as generateCall but for type literals instead of function calls.
   *
   * @param {ParserRuleContext} ctx - The literal node
   * @param {Object} lhsType - The type
   * @param {Array} args - Arguments to the template
   * @param {String} defaultT - The default if no template exists.
   * @param {Boolean} skipNew - Optional: If true, never add new.
   *
   * @return {String}
   */
  generateLiteral(ctx, lhsType, args, defaultT, skipNew) {
    if (`emit${lhsType.id}` in this) {
      return this[`emit${lhsType.id}`](ctx);
    }
    if (lhsType.template) {
      const str = lhsType.template(...args);
      return this.Syntax.new.template
        ? this.Syntax.new.template(str, skipNew, lhsType.code)
        : str;
    }
    return defaultT;
  }

  getIndentDepth(ctx) {
    while (ctx.indentDepth === undefined) {
      ctx = ctx.parentCtx;
      if (ctx === undefined || ctx === null) {
        return -1;
      }
    }
    return ctx.indentDepth;
  }

  /**
   * Selectively visits children of a node. NOTE not currently being used.
   *
   * @param {ParserRuleContext} ctx
   * @param {Object} options:
   *    start - child index to start iterating at.
   *    end - child index to end iterating after.
   *    step - how many children to increment each step, 1 visits all children.
   *    separator - a string separator to go between children.
   *    ignore - an array of child indexes to skip.
   *    children - the set of children to visit.
   * @returns {String}
   */
  visitChildren(ctx, options) {
    const opts = {
      start: 0, step: 1, separator: '', ignore: [], children: ctx.children
    };
    Object.assign(opts, options ? options : {});
    opts.end = ('end' in opts) ? opts.end : opts.children.length - 1;

    let code = '';
    for (let i = opts.start; i <= opts.end; i += opts.step) {
      if (opts.ignore.indexOf(i) === -1) {
        code = `${code}${this.visit(
          opts.children[i]
        )}${(i === opts.end) ? '' : opts.separator}`;
      }
    }
    return code;
  }

  /**
   * Visit a end-of-file symbol. Universal for all grammars.
   * *
   * @returns {String}
   */
  visitEof() {
    if (this.Syntax.eof.template) {
      return this.Syntax.eof.template();
    }
    return '';
  }

  /**
   * Visit a end-of-line symbol. Universal for all grammars.
   * *
   * @returns {String}
   */
  visitEos() {
    if (this.Syntax.eos.template) {
      return this.Syntax.eos.template();
    }
    return '\n';
  }

  /**
   * Visit a leaf node and return a string. Universal for all grammars.
   * *
   * @param {ParserRuleContext} ctx
   * @returns {String}
   */
  visitTerminal(ctx) {
    return ctx.getText();
  }
};
