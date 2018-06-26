/* eslint complexity: 0 */
const ECMAScriptVisitor = require('../../lib/antlr/ECMAScriptVisitor').ECMAScriptVisitor;
const bson = require('bson');
const Context = require('context-eval');
const {
  BsonCompilersArgumentError,
  BsonCompilersAttributeError,
  BsonCompilersRuntimeError,
  BsonCompilersTypeError,
  BsonCompilersReferenceError,
  BsonCompilersInternalError,
  BsonCompilersUnimplementedError
} = require('../../helper/error');

/**
 * This is a Visitor that visits the tree generated by the ECMAScript.g4 grammar.
 *
 * @returns {Visitor}
 */
class Visitor extends ECMAScriptVisitor {
  constructor() {
    super();
    this.new = '';
    this.processInt32 = this.processNumber;
    this.processDouble = this.processNumber;

    // Throw UnimplementedError for nodes with expressions that we don't support
    this.visitThisExpression =
    this.visitDeleteExpression =
    this.visitVoidExpression =
    this.visitTypeofExpression =
    this.visitInExpression =
    this.visitInstanceofExpression =
    this.visitFuncDefExpression =
    this.visitAssignmentExpression =
    this.visitAssignmentOperatorExpression =
    this.visitMemberIndexExpression =
    this.visitTernaryExpression =
    this.visitFunctionDeclaration =
    this.visitVariableStatement =
    this.visitIfStatement =
    this.visitDoWhileStatement =
    this.visitWhileStatement =
    this.visitForStatement =
    this.visitForVarStatement =
    this.visitForInStatement =
    this.visitForVarInStatement =
    this.visitContinueStatement =
    this.visitBreakStatement =
    this.visitReturnStatement =
    this.visitWithStatement =
    this.visitLabelledStatement =
    this.visitSwitchStatement =
    this.visitThrowStatement =
    this.visitTryStatement =
    this.visitDebuggerStatement =
      this.unimplemented;
  }

  unimplemented(ctx) {
    const name = ctx.constructor.name ?
      ctx.constructor.name.replace('Context', '') : 'Expression';
    throw new BsonCompilersUnimplementedError(
      `'${name}' not yet implemented`
    );
  }

  start(ctx) {
    return this.visitProgram(ctx);
  }

  visitEof() {
    if (this.Syntax.eof.template) {
      return this.Syntax.eof.template();
    }
    return '\n';
  }

  visitEos() {
    if (this.Syntax.eos.template) {
      return this.Syntax.eos.template();
    }
    return '\n';
  }

  visitEmptyStatement() {
    return '\n';
  }

  /**
   * Selectively visits children of a node.
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
        code += this.visit(opts.children[i]) + (i === opts.end ? '' : opts.separator);
      }
    }
    /* Set the node's type to the first child, if it's not already set.
      More often than not, type will be set directly by the visitNode method. */
    if (ctx.type === undefined) {
      ctx.type = opts.children.length ? opts.children[0].type : this.Types._undefined;
    }
    return code.trim();
  }

  visitEqualityExpression(ctx) {
    ctx.type = this.Types._boolean;
    const lhs = this.visit(ctx.singleExpression()[0]);
    const rhs = this.visit(ctx.singleExpression()[1]);
    const op = this.visit(ctx.children[1]);
    if (this.Syntax.equality) {
      return this.Syntax.equality.template(lhs, op, rhs);
    }
    return this.visitChildren(ctx);
  }

  /**
   * Child nodes: literal
   * @param {LiteralExpressionContext} ctx
   * @return {String}
   */
  visitLiteralExpression(ctx) {
    if (!ctx.type) {
      ctx.type = this.getPrimitiveType(ctx.literal());
    }
    // Pass the original argument type to the template, not the casted type.
    const type = ctx.originalType === undefined ? ctx.type : ctx.originalType;
    if (`process${ctx.type.id}` in this) {
      return this[`process${ctx.type.id}`](ctx);
    }
    if (`emit${ctx.type.id}` in this) {
      return this[`emit${ctx.type.id}`](ctx);
    }

    if (ctx.type.template) {
      return ctx.type.template(this.visitChildren(ctx), type.id);
    }

    return this.visitChildren(ctx);
  }

  getIndentDepth(ctx) {
    while (ctx.indentDepth === undefined) {
      ctx = ctx.parentCtx;
      if (ctx === undefined || ctx === null) {
        return 0;
      }
    }
    return ctx.indentDepth;
  }

  /**
   * Child nodes: propertyNameAndValueList?
   * @param {ObjectLiteralContext} ctx
   * @return {String}
   */
  visitObjectLiteral(ctx) {
    ctx.type = this.Types._object;
    ctx.indentDepth = this.getIndentDepth(ctx) + 1;
    let args = '';
    if (ctx.propertyNameAndValueList()) {
      const properties = ctx.propertyNameAndValueList().propertyAssignment();
      if (ctx.type.argsTemplate) {
        args = ctx.type.argsTemplate(properties.map((pair) => {
          return [this.visit(pair.propertyName()), this.visit(pair.singleExpression())];
        }), ctx.indentDepth);
      }
    }
    if (ctx.type.template) {
      return ctx.type.template(args, ctx.indentDepth);
    }
    return this.visitChildren(ctx);
  }

  /**
   * Child nodes: elementList*
   * @param {ArrayLiteralContext} ctx
   * @return {String}
   */
  visitArrayLiteral(ctx) {
    ctx.type = this.Types._array;
    ctx.indentDepth = this.getIndentDepth(ctx) + 1;
    let args = '';
    if (ctx.elementList()) {
      const visitedChildren = ctx.elementList().children.map((child) => {
        return this.visit(child);
      });
      const visitedElements = visitedChildren.filter((arg) => {
        return arg !== ',';
      });
      if (ctx.type.argsTemplate) { // NOTE: not currently being used anywhere.
        args = ctx.type.argsTemplate(visitedElements, ctx.indentDepth);
      } else {
        args = visitedElements.join(', ');
      }
    }
    if (ctx.type.template) {
      return ctx.type.template(args, ctx.indentDepth);
    }
    return this.visitChildren(ctx);
  }

  /**
   * One terminal child.
   * @param {ElisionContext} ctx
   * @return {String}
   */
  visitElision(ctx) {
    ctx.type = this.Types._undefined;
    if (ctx.type.template) {
      return ctx.type.template();
    }
    return 'null';
  }


  /**
   * Child nodes: singleExpression arguments
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  visitFuncCallExpression(ctx) {
    const lhs = this.visit(ctx.singleExpression());
    let lhsType = ctx.singleExpression().type;
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

    // Check if callable
    ctx.type = lhsType.type;
    if (!lhsType.callable) {
      throw new BsonCompilersTypeError(`${lhsType.id} is not callable`);
    }

    // Check arguments
    const expectedArgs = lhsType.args;
    let rhs = this.checkArguments(expectedArgs, ctx.arguments().argumentList(), lhsType.id);

    // Add new if needed
    const newStr = lhsType.callable === this.SYMBOL_TYPE.CONSTRUCTOR ? this.new : '';

    // Apply the arguments template
    if (lhsType.argsTemplate) {
      let l = lhs;
      if ('identifierName' in ctx.singleExpression()) {
        l = this.visit(ctx.singleExpression().singleExpression());
      }
      rhs = lhsType.argsTemplate(l, ...rhs);
    } else {
      rhs = `(${rhs.join(', ')})`;
    }
    return `${newStr}${lhs}${rhs}`;
  }

  visitIdentifierExpression(ctx) {
    const name = this.visitChildren(ctx);
    ctx.type = this.Symbols[name];
    if (ctx.type === undefined) {
      throw new BsonCompilersReferenceError(`Symbol '${name}' is undefined`);
    }
    if (ctx.type.template) {
      return ctx.type.template();
    }
    return name;
  }

  /**
   * This will check the type of the attribute, and error if it's a BSON symbol
   * or a JS Symbol and it is undefined. If it's not either of those symbols, it
   * doesn't error. TODO: should always error? never error?
   *
   * Child nodes: singleExpression identifierName
   * @param {GetAttributeExpressionContext} ctx
   * @return {String}
   */
  visitGetAttributeExpression(ctx) {
    const lhs = this.visit(ctx.singleExpression());
    const rhs = this.visit(ctx.identifierName());

    if (!ctx.singleExpression().constructor.name.includes('Identifier') && !ctx.singleExpression().constructor.name.includes('FuncCall')) {
      throw new BsonCompilersUnimplementedError('Attribute access for non-symbols not currently supported');
    }

    let type = ctx.singleExpression().type;
    if (typeof type === 'string') {
      type = this.Types[type];
    }
    while (type !== null) {
      if (!(type.attr.hasOwnProperty(rhs))) {
        if (type.id in this.BsonTypes && this.BsonTypes[type.id].id !== null) {
          throw new BsonCompilersAttributeError(
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
   * New in the shell/js is the same as calling without arguments.
   * @param {NewExpressionContext} ctx
   * @return {String}
   */
  visitNewExpression(ctx) {
    ctx.singleExpression().wasNew = true;
    if ('emitNew' in this) {
      return this.emitNew(ctx);
    }
    const res = this.visitChildren(ctx, {separator: ' '});
    ctx.type = ctx.singleExpression().type;
    return res;
  }

  /**
   * Visit a leaf node and return a string.
   * *
   * @param {ParserRuleContext} ctx
   * @returns {String}
   */
  visitTerminal(ctx) {
    return ctx.getText();
  }

  // //////////
  // Helpers //
  // //////////
  /**
   * Get the type of a node. TODO: nicer way to write it?
   * @param {LiteralContext} ctx
   * @return {Symbol}
   */
  getPrimitiveType(ctx) {
    if ('NullLiteral' in ctx) {
      return this.Types._null;
    }
    if ('UndefinedLiteral' in ctx) {
      return this.Types._undefined;
    }
    if ('BooleanLiteral' in ctx) {
      return this.Types._bool;
    }
    if ('StringLiteral' in ctx) {
      return this.Types._string;
    }
    if ('RegularExpressionLiteral' in ctx) {
      return this.Types._regex;
    }
    if ('numericLiteral' in ctx) {
      const number = ctx.numericLiteral();
      if ('IntegerLiteral' in number) {
        return this.Types._long;
      }
      if ('DecimalLiteral' in number) {
        return this.Types._decimal;
      }
      if ('HexIntegerLiteral' in number) {
        return this.Types._hex;
      }
      if ('OctalIntegerLiteral' in number) {
        return this.Types._octal;
      }
    }
    // TODO: or raise error?
    return this.Types._undefined;
  }

  executeJavascript(input) {
    const sandbox = {
      RegExp: RegExp,
      BSONRegExp: bson.BSONRegExp,
      // Binary: bson.Binary,
      DBRef: bson.DBRef,
      Decimal128: bson.Decimal128,
      Double: bson.Double,
      Int32: bson.Int32,
      Long: bson.Long,
      Int64: bson.Long,
      Map: bson.Map,
      MaxKey: bson.MaxKey,
      MinKey: bson.MinKey,
      ObjectID: bson.ObjectID,
      ObjectId: bson.ObjectID,
      Symbol: bson.Symbol,
      Timestamp: bson.Timestamp,
      Code: function(c, s) {
        return new bson.Code(c, s);
      },
      Date: function(s) {
        const args = Array.from(arguments);

        if (args.length === 1) {
          return new Date(s);
        }

        return new Date(Date.UTC(...args));
      },
      Buffer: Buffer,
      __result: {}
    };
    const ctx = new Context(sandbox);
    const res = ctx.evaluate('__result = ' + input);
    ctx.destroy();
    return res;
  }

  getTyped(actual) {
    if (actual.type === undefined) {
      while (actual.singleExpression()) {
        actual = actual.singleExpression();
        if (actual.type !== undefined) {
          break;
        }
      }
    }
    if (actual.type === undefined) {
      throw new BsonCompilersInternalError();
    }
    return actual;
  }

  /**
   * Convert between numeric types. Required so that we don't end up with
   * strange conversions like 'Int32(Double(2))', and can just generate '2'.
   *
   * @param {Array} expectedType - types to cast to.
   * @param {antlr4.ParserRuleContext} actualCtx - ctx to cast from, if valid.
   *
   * @returns {String} - visited result, or null on error.
   */
  castType(expectedType, actualCtx) {
    const result = this.visit(actualCtx);
    const originalCtx = actualCtx;
    actualCtx = this.getTyped(actualCtx);

    // If the types are exactly the same, just return.
    if (expectedType.indexOf(actualCtx.type) !== -1 ||
        expectedType.indexOf(actualCtx.type.id) !== -1) {
      return result;
    }

    const numericTypes = [
      this.Types._integer, this.Types._decimal, this.Types._hex, this.Types._octal, this.Types._long, this.Types._numeric
    ];
    // If the expected type is "numeric", accept the numeric basic types + numeric bson types
    if (expectedType.indexOf(this.Types._numeric) !== -1 &&
       (numericTypes.indexOf(actualCtx.type) !== -1 ||
         (actualCtx.type.id === 'Long' ||
          actualCtx.type.id === 'Int32' ||
          actualCtx.type.id === 'Double'))) {
      return result;
    }

    // Check if the arguments are both numbers. If so then cast to expected type.
    for (let i = 0; i < expectedType.length; i++) {
      if (numericTypes.indexOf(actualCtx.type) !== -1 &&
        numericTypes.indexOf(expectedType[i]) !== -1) {
        // Need to interpret octal always
        if (actualCtx.type.id === '_octal') {
          const node = {
            type: expectedType[i],
            originalType: actualCtx.type.id,
            children: [ actualCtx ]
          };
          return this.visitLiteralExpression(node);
        }
        actualCtx.originalType = actualCtx.type;
        actualCtx.type = expectedType[i];
        return this.visit(originalCtx);
      }
    }
    return null;
  }

  /**
   * Validate each argument against the expected argument types defined in the
   * Symbol table.
   *
   * @param {Array} expected - An array of arrays where each subarray represents
   * possible argument types for that index.
   * @param {ArgumentListContext} argumentList - null if empty.
   * @param {String} name - The name of the function for error reporting.
   *
   * @returns {Array} - Array containing the generated output for each argument.
   */
  checkArguments(expected, argumentList, name) {
    const argStr = [];
    if (!argumentList) {
      if (expected.length === 0 || expected[0].indexOf(null) !== -1) {
        return argStr;
      }
      throw new BsonCompilersArgumentError(
        `Argument count mismatch: '${name}' requires least one argument`
      );
    }
    const args = argumentList.singleExpression();
    if (args.length > expected.length) {
      throw new BsonCompilersArgumentError(
        `Argument count mismatch: '${name}' expects ${expected.length} args and got ${args.length}`
      );
    }
    for (let i = 0; i < expected.length; i++) {
      if (args[i] === undefined) {
        if (expected[i].indexOf(null) !== -1) {
          return argStr;
        }
        throw new BsonCompilersArgumentError(
          `Argument count mismatch: too few arguments passed to '${name}'`
        );
      }
      const result = this.castType(expected[i], args[i]);
      if (result === null) {
        const message = `Argument type mismatch: '${name}' expects types ${expected[i].map((e) => {
          const id = e && e.id ? e.id : e;
          return e ? id : '[optional]';
        })} but got type ${args[i].type.id} for argument at index ${i}`;

        throw new BsonCompilersArgumentError(message);
      }
      argStr.push(result);
    }
    return argStr;
  }

  /**
   * Need process method because we want to pass the argument type to the template
   * so that we can determine if the generated number needs to be parsed or casted.
   *
   * @param {FuncCallExpressionContext} ctx
   * @returns {String}
   */
  processNumber(ctx) {
    const lhsStr = this.visit(ctx.singleExpression());
    let lhsType = ctx.singleExpression().type;
    if (typeof lhsType === 'string') {
      lhsType = this.Types[lhsType];
    }
    ctx.type = lhsType.id === 'Number' ? this.Types._decimal : lhsType.type;

    // Get the original type of the argument
    const expectedArgs = lhsType.args;
    let args = this.checkArguments(expectedArgs, ctx.arguments().argumentList(), lhsType.id);
    let argType;

    if (!ctx.arguments().argumentList()) {
      args = ['0'];
      argType = this.Types._integer;
    } else {
      const argNode = ctx.arguments().argumentList().singleExpression()[0];
      const typed = this.getTyped(argNode);
      argType = typed.originalType !== undefined ? typed.originalType : typed.type;
    }

    if (`emit${lhsType.id}` in this) {
      return this[`emit${lhsType.id}`](ctx, argType);
    }

    // Apply the arguments template
    const lhs = lhsType.template ? lhsType.template() : lhsStr;
    const rhs = lhsType.argsTemplate ? lhsType.argsTemplate(lhs, args[0], argType.id) : `(${args.join(', ')})`;
    return `${lhs}${rhs}`;
  }

  /**
   * Check arguments then execute in the same way as regex literals.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processRegExp(ctx) {
    const argList = ctx.arguments().argumentList();
    this.checkArguments(this.Symbols.RegExp.args, argList, 'RegExp');
    return this.process_regex(ctx);
  }

  /**
   * This looks like non-camelcase because the name of the basic type is "_regex"
   * and the process methods are constructed with "Process" + <type name>.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  process_regex(ctx) { // eslint-disable-line camelcase
    ctx.type = this.Types._regex;
    let pattern;
    let flags;

    try {
      const regexobj = this.executeJavascript(ctx.getText());
      pattern = regexobj.source;
      flags = regexobj.flags;
    } catch (error) {
      throw new BsonCompilersRuntimeError(error.message);
    }

    let targetflags = flags.replace(/[imuyg]/g, m => this.regexFlags[m]);
    targetflags = targetflags === '' ? '' : `${targetflags.split('').sort().join('')}`;

    if ('emitRegExp' in this) {
      return this.emitRegExp(ctx, pattern, targetflags);
    }

    if (ctx.type.template) {
      return ctx.type.template(pattern, targetflags);
    }
    return this.visitChildren(ctx);
  }

  /**
   * Process BSON regexps because we need to verify the flags are valid.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {string}
   */
  processBSONRegExp(ctx) {
    ctx.type = this.Types.BSONRegExpType;
    const symbolType = this.Symbols.BSONRegExp;

    const argList = ctx.arguments().argumentList();
    const args = this.checkArguments([[this.Types._string], [this.Types._string, null]], argList, 'BSONRegExp');

    let flags = null;
    const pattern = args[0];
    if (args.length === 2) {
      flags = args[1];
      for (let i = 1; i < flags.length - 1; i++) {
        if (!(flags[i] in this.bsonRegexFlags)) {
          throw new BsonCompilersRuntimeError(`Invalid flag '${flags[i]}' passed to BSONRegExp`);
        }
      }
      flags = flags.replace(/[imxlsu]/g, m => this.bsonRegexFlags[m]);
    }

    if ('emitBSONRegExp' in this) {
      return this.emitBSONRegExp(ctx, pattern, flags);
    }
    const lhs = symbolType.template ? symbolType.template() : 'BSONRegExp';
    const rhs = symbolType.argsTemplate ? symbolType.argsTemplate(lhs, pattern, flags) : `(${pattern}${flags ? ', ' + flags : ''})`;
    return `${this.new}${lhs}${rhs}`;
  }

  /**
   * The arguments to Code can be either a string or actual javascript code.
   * Manually check arguments here because first argument can be any JS, and we
   * don't want to ever visit that node.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processCodeFromJS(ctx) {
    ctx.type = this.Types.Code;
    const symbolType = this.Symbols.Code;
    const argList = ctx.arguments().argumentList();
    if (!argList ||
      !(argList.singleExpression().length === 1 ||
        argList.singleExpression().length === 2)) {
      throw new BsonCompilersArgumentError(
        'Argument count mismatch: Code requires one or two arguments'
      );
    }
    const args = argList.singleExpression();
    const code = args[0].getText();
    let scope = undefined;
    let scopestr = '';

    if (args.length === 2) {
      scope = this.visit(args[1]);
      scopestr = `, ${scope}`;
      if (args[1].type !== this.Types._object) {
        throw new BsonCompilersArgumentError(
          'Argument type mismatch: Code requires scope to be an object'
        );
      }
    }
    if ('emitCode' in this) {
      return this.emitCode(ctx, code, scope);
    }
    const lhs = symbolType.template ? symbolType.template() : 'Code';
    const rhs = symbolType.argsTemplate ? symbolType.argsTemplate(lhs, code, scope) : `(${code}${scopestr})`;
    return `${this.new}${lhs}${rhs}`;
  }

  /**
   * ObjectId needs preprocessing because it needs to be executed.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processObjectId(ctx) {
    ctx.type = this.Types.ObjectId;
    const symbolType = this.Symbols.ObjectId;
    const argList = ctx.arguments().argumentList();
    const lhs = symbolType.template ? symbolType.template() : 'ObjectId';
    if (!argList) {
      return `${this.new}${lhs}()`;
    }
    this.checkArguments(symbolType.args, argList, 'ObjectId');
    let hexstr;
    try {
      hexstr = this.executeJavascript(ctx.getText()).toHexString();
    } catch (error) {
      throw new BsonCompilersRuntimeError(error.message);
    }
    if ('emitObjectId' in this) {
      return this.emitObjectId(ctx, hexstr);
    }
    const rhs = symbolType.argsTemplate ? symbolType.argsTemplate(lhs, hexstr) : `(${hexstr})`;
    return `${this.new}${lhs}${rhs}`;
  }

  /**
   * Long needs preprocessing because it needs to be executed.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processLong(ctx) {
    ctx.type = this.Types.Long;
    const symbolType = this.Symbols.Long;
    const argList = ctx.arguments().argumentList();
    let longstr;
    this.checkArguments(symbolType.args, argList, 'Long');
    try {
      longstr = this.executeJavascript(`new ${ctx.getText()}`).toString();
    } catch (error) {
      throw new BsonCompilersRuntimeError(error.message);
    }
    if ('emitLong' in this) {
      return this.emitLong(ctx, longstr);
    }
    const lhs = symbolType.template ? symbolType.template() : 'Long';
    const rhs = symbolType.argsTemplate ? symbolType.argsTemplate(lhs, longstr) : `(${longstr})`;
    return `${this.new}${lhs}${rhs}`;
  }

  processLongfromBits(ctx) {
    return this.processLong(ctx);
  }

  /**
   * Decimal128 needs preprocessing because it needs to be executed. Check
   * argument length manually because 'Buffer' not supported.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processDecimal128(ctx) {
    ctx.type = this.Types.Decimal128;
    const symbolType = this.Symbols.Decimal128;
    let decstr;
    const argList = ctx.arguments().argumentList();

    if (!argList || argList.singleExpression().length !== 1) {
      throw new BsonCompilersArgumentError(
        'Argument count mismatch: Decimal128 requires one argument'
      );
    }

    try {
      decstr = this.executeJavascript(`new ${ctx.getText()}`).toString();
    } catch (error) {
      // TODO: this isn't quite right because it catches all type errors.
      if (error.name === 'TypeError' || error.code === 'ERR_INVALID_ARG_TYPE') {
        throw new BsonCompilersArgumentError(error.message);
      }

      throw new BsonCompilersRuntimeError(error.message);
    }

    if ('emitDecimal128' in this) {
      return this.emitDecimal128(ctx, decstr);
    }
    const lhs = symbolType.template ? symbolType.template() : 'Decimal128';
    const rhs = symbolType.argsTemplate ? symbolType.argsTemplate(lhs, decstr) : `(${decstr})`;
    return `${this.new}${lhs}${rhs}`;
  }

  /**
   * This is a bit weird because we can just convert to string directly.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processLongtoString(ctx) {
    ctx.type = this.Types._string;
    const long = ctx.singleExpression().singleExpression();
    let longstr;
    const argList = ctx.arguments().argumentList();
    this.checkArguments([[this.Types._numeric, null]], argList, 'Long toString');

    try {
      longstr = this.executeJavascript(long.getText()).toString();
    } catch (error) {
      throw new BsonCompilersRuntimeError(error.message);
    }
    return ctx.type.template ? ctx.type.template(longstr) : `'${longstr}'`;
  }

  /**
   * Preprocessed because different target languages need different info out
   * of the constructed date, so we want to execute it. Passes a constructed
   * date object to the emit methods.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processDate(ctx) {
    ctx.type = this.Types.Date;

    const args = ctx.arguments();
    if (!args.argumentList()) {
      if ('emitDate' in this) {
        return this.emitDate(ctx);
      }
    }

    const argList = ctx.arguments().argumentList();
    try {
      this.checkArguments(this.Symbols.Date.args, argList, 'Date');
    } catch (e) {
      throw new BsonCompilersArgumentError(
        'Invalid argument to Date: requires either no args, one string or number, or up to 7 numbers'
      );
    }

    let text = ctx.getText();
    text = text.startsWith('new ') ? text : `new ${text}`;
    let date;
    try {
      date = this.executeJavascript(text);
    } catch (error) {
      throw new BsonCompilersRuntimeError(error.message);
    }
    if ('emitDate' in this) {
      return this.emitDate(ctx, date);
    }
    return ctx.getText();
  }

  /**
   * Binary needs preprocessing because it needs to be executed. Manually check
   * argument length because 'Buffer' not supported.
   *
   * TODO: figure out if it ever makes sense to support Binary.
   */
  processBinary() {
    throw new BsonCompilersUnimplementedError('Binary type not supported');
  }
}

module.exports = Visitor;
