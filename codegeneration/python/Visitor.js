/* eslint camelcase: 0 complexity: 0*/
const Context = require('context-eval');
const {
  BsonTranspilersArgumentError,
  BsonTranspilersRuntimeError,
  BsonTranspilersInternalError,
  BsonTranspilersUnimplementedError
} = require('../../helper/error');
const { removeQuotes } = require('../../helper/format');

/**
 * This is a Visitor that visits the tree generated by the Python3.g4 grammar.
 *
 * @param {CodeGenerationVisitor} CodeGenerationVisitor - class shared between
 * all visitors.
 * @return {Visitor} - Input-language specific visitor.
 */
module.exports = (CodeGenerationVisitor) => class Visitor extends CodeGenerationVisitor {
  constructor() {
    super();
    this.startRule = 'file_input'; // Name of the ANTLR rule to start


    // Throw UnimplementedError for nodes with expressions that we don't support
    this.visitDel_stmt =
    this.visitPass_stmt =
    this.visitFlow_stmt =
    this.visitImport_stmt =
    this.visitGlobal_stmt =
    this.visitNonlocal_stmt =
    this.visitAssert_stmt =
    this.visitIf_stmt =
    this.visitWhile_stmt =
    this.visitFor_stmt =
    this.visitTry_stmt =
    this.visitWith_stmt =
    this.visitFuncdef =
    this.visitClassdef =
    this.visitDecorated =
    this.visitAsync_stmt =
    this.visitComp_iter =
    this.visitStar_expr =
    this.visitInline_if =
    this.visitAssign_stmt =
    this.visitEllipsesAtom =
    this.visitAugassign =
    this.visitImag_literal =
      this.unimplemented;
  }

  /*
   *
   * Visit Methods
   *
   */

  visitFile_input(ctx) {
    if (ctx.stmt().length !== 1) {
      throw new BsonTranspilersRuntimeError(`Expression contains ${
        ctx.stmt().length} statements. Input should be a single statement`);
    }
    return this.visitChildren(ctx);
  }

  visitFunctionCall(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    return this.generateFunctionCall(ctx);
  }

  visitIdentifier(ctx) {
    return this.generateIdentifier(ctx);
  }

  visitAttributeAccess(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    return this.generateAttributeAccess(ctx);
  }

  visitObject_literal(ctx) {
    this.testForComprehension(ctx.dictorsetmaker());
    return this.generateObjectLiteral(ctx);
  }

  visitArray_literal(ctx) {
    this.testForComprehension(ctx.testlist_comp());
    return this.generateArrayLiteral(ctx);
  }

  visitExpr(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    if (this.Syntax.binary.template) {
      const kids = ctx.children.map(m => this.visit(m));
      return this.Syntax.binary.template(kids);
    }
    return this.visitChildren(ctx);
  }

  visitXor_expr(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    if (this.Syntax.binary.template) {
      const kids = ctx.children.map(m => this.visit(m));
      return this.Syntax.binary.template(kids);
    }
    return this.visitChildren(ctx);
  }

  visitAnd_expr(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    if (this.Syntax.binary.template) {
      const kids = ctx.children.map(m => this.visit(m));
      return this.Syntax.binary.template(kids);
    }
    return this.visitChildren(ctx);
  }


  visitShift_expr(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    const args = ctx.children.map((n) => this.visit(n));
    if (this.Syntax.binary.template) {
      return this.Syntax.binary.template(args);
    }
    return this.visitChildren(ctx);
  }

  visitArith_expr(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    const args = ctx.children.map((n) => this.visit(n));
    if (this.Syntax.binary.template) {
      return this.Syntax.binary.template(args);
    }
    return this.visitChildren(ctx);
  }

  /* So far, this only exists in Python so it hasn't been moved to
   * CodeGenerationVisitor. However, if another input or output language has a
   * set implementation, should move this to the shared visitor. */
  visitSet_literal(ctx) {
    ctx.type = this.Types._array;
    ctx.indentDepth = this.findIndentDepth(ctx) + 1;
    this.requiredImports[9] = true;
    let args = [];
    const list = ctx.testlist_comp();
    this.testForComprehension(list);
    let join;
    if (list) {
      // Sets of 1 item is the same as the item itself, but keep parens for math
      if (list.children.length === 1) {
        return this.returnParenthesis(this.visit(list.children[0]));
      }
      const visitedChildren = list.children.map((child) => {
        return this.visit(child);
      });
      const visitedElements = visitedChildren.filter((arg) => {
        return arg !== ',';
      });
      if (ctx.type.argsTemplate) { // NOTE: not currently being used anywhere.
        args = visitedElements.map((arg, index) => {
          const last = !visitedElements[index + 1];
          return ctx.type.argsTemplate(arg, ctx.indentDepth, last);
        });
        join = '';
      } else {
        args = visitedElements;
        join = ', ';
      }
    }
    if (ctx.type.template) {
      return ctx.type.template(args.join(join), ctx.indentDepth);
    }
    return this.returnSet(args, ctx);
  }

  visitStringAtom(ctx) {
    ctx.type = this.Types._string;
    this.requiredImports[ctx.type.code] = true;
    // Pass the original argument type to the template, not the casted type.
    const type = ctx.originalType === undefined ? ctx.type : ctx.originalType;

    let result = this.visitChildren(ctx);
    result = result.replace(/^([rubf]?[rubf]["']|'''|"""|'|")/gi, '');
    result = result.replace(/(["]{3}|["]|[']{3}|['])$/, '');
    return this.generateLiteral(
      ctx, ctx.type, [result, type.id], `'${result}'`, true
    );
  }

  visitInteger_literal(ctx) {
    return this.leafHelper(this.Types._long, ctx);
  }

  visitOct_literal(ctx) {
    return this.leafHelper(this.Types._octal, ctx);
  }

  visitHex_literal(ctx) {
    return this.leafHelper(this.Types._hex, ctx);
  }

  visitBin_literal(ctx) {
    return this.leafHelper(this.Types._bin, ctx);
  }

  visitFloat_literal(ctx) {
    return this.leafHelper(this.Types._decimal, ctx);
  }

  visitBoolean_literal(ctx) {
    return this.leafHelper(this.Types._bool, ctx);
  }

  visitNone_literal(ctx) {
    return this.leafHelper(this.Types._null, ctx);
  }

  visitExpr_stmt(ctx) {
    if (
      ('assign_stmt' in ctx && ctx.assign_stmt() !== null) ||
      ('augassign' in ctx && ctx.augassign() !== null) ||
      ('annassign' in ctx && ctx.annassign() !== null)
    ) {
      throw new BsonTranspilersUnimplementedError(
        'Assignment not yet implemented'
      );
    }
    return this.visitChildren(ctx);
  }

  visitFactor(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    // For the expression "+1", set the type to the child's type.
    const op = this.visit(ctx.children[0]);
    const factor = this.visit(ctx.factor());

    ctx.type = this.findTypedNode(ctx.factor()).type;
    if (this.Syntax.unary.template) {
      return this.Syntax.unary.template(
        op,
        factor
      );
    }
    return `${op}${factor}`;
  }

  visitTerm(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    const args = ctx.children.map((n) => this.visit(n));
    if (this.Syntax.binary.template) {
      return this.Syntax.binary.template(args);
    }
    return this.visitChildren(ctx);
  }

  visitPower(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    const lhs = this.visit(ctx.atom());
    const rhs = this.visit(ctx.factor());
    if (this.Syntax.binary.template) {
      return this.Syntax.binary.template([lhs, '**', rhs]);
    }
    return `${lhs} ** ${rhs}`;
  }

  visitAnd_test(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    const children = ctx.not_test().map((t) => ( this.visit(t) ));
    if (this.Syntax.and) {
      return this.Syntax.and.template(children);
    }
    return children.join(' and ');
  }

  visitOr_test(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    const children = ctx.and_test().map((t) => (this.visit(t)));
    if (this.Syntax.or) {
      return this.Syntax.or.template(children);
    }
    return children.join(' or ');
  }

  visitNot_test(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    const child = this.visit(ctx.children[1]);
    if (this.Syntax.not) {
      return this.Syntax.not.template(child);
    }
  }

  returnComparison(ctx) {
    let skip = false;
    return ctx.children.reduce((str, e, i, arr) => {
      if (skip) { // Skip for 'in' statements because swallows rhs
        skip = false;
        return str;
      }
      if (i === arr.length - 1) { // Always visit the last element
        return `${str}${this.visit(e)}`;
      }
      if (i % 2 === 0) { // Only ops
        return str;
      }
      const op = this.visit(e);
      if (op === '==' || op === '!=' || op === 'is' || op === 'isnot') {
        if (this.Syntax.equality) {
          return `${str}${this.Syntax.equality.template(
            this.visit(arr[i - 1]), op, '')}`;
        }
        return `${str} === ${this.visit(arr[i - 1])} ${op} `;
      }
      if (op === 'in' || op === 'notin') {
        skip = true;
        if (this.Syntax.in) {
          return `${str}${this.Syntax.in.template(
            this.visit(arr[i - 1]), op, this.visit(arr[i + 1]))}`;
        }
        return `${str} ${this.visit(arr[i - 1])} ${op} ${this.visit(arr[i + 1])}`;
      }
      return `${str}${this.visit(arr[i - 1])} ${op} `;
    }, '');
  }

  visitComparison(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    return this.returnComparison(ctx);
  }

  visitIndexAccess(ctx) {
    if (ctx.getChildCount() === 1) {
      return this.visitChildren(ctx);
    }
    throw new BsonTranspilersUnimplementedError('Indexing not currently supported');
  }

  /*
   *
   * Process Methods
   *
   */

  processint(ctx) {
    return this.generateNumericClass(ctx);
  }

  processfloat(ctx) {
    return this.generateNumericClass(ctx);
  }

  processInt64(ctx) {
    return this.generateNumericClass(ctx);
  }

  processfrom_native(ctx) {
    ctx.type = this.Types.BSONRegExp;
    const symbolType = this.Symbols.Regex;

    const argList = this.getArguments(ctx);
    if (argList.length !== 1) {
      throw new BsonTranspilersArgumentError('RegExp.from_native requires one argument');
    }
    const pythonFlags = {
      256: '', 2: 'i', 128: '', 4: 'l', 8: 'm', 16: 's', 64: 'x'
    };
    const native = this.skipFakeNodesDown(this.getArgumentAt(ctx, 0));
    const args = this.findPatternAndFlags(native, pythonFlags, this.Syntax.bsonRegexFlags);

    return this.generateCall(
      ctx, symbolType, args, 'Regex',
      `(${args[0]}${args[1] ? ', ' + args[1] : ''})`
    );
  }

  processcompile(ctx) {
    ctx.type = this.Types._regex;
    const pythonFlags = {
      256: '', 2: 'i', 128: '', 4: '', 8: 'm', 16: '', 64: ''
    };
    const args = this.findPatternAndFlags(ctx, pythonFlags, this.Syntax.regexFlags);
    return this.generateLiteral(ctx, ctx.type, args, 'RegExp');
  }

  processRegex(ctx) {
    return this.generateBSONRegex(ctx, this.Types.Regex, this.Symbols.Regex);
  }

  processCode(ctx) {
    return this.generateBSONCode(ctx, this.Types.Code, this.Symbols.Code, true);
  }

  processdatetime(ctx) {
    ctx.type = this.Types.Date;
    ctx.wasNew = true; // Always true for non-js
    const symbolType = this.Symbols.datetime;
    let date = null;

    const argsList = this.getArguments(ctx);
    if (argsList.length !== 0) {
      if (argsList.length < 3) {
        throw new BsonTranspilersArgumentError(
          `Wrong number of arguments to datetime: needs at at least 3, got ${
            argsList.length}`
        );
      }

      try {
        this.checkArguments(symbolType.args, argsList, 'datetime');
      } catch (e) {
        throw new BsonTranspilersArgumentError(
          `Invalid argument to datetime: requires no args or up to 7 numbers. ${
            e.message}`
        );
      }

      const argvals = argsList.map((k) => {
        let v;
        try {
          v = parseInt(k.getText(), 10);
        } catch (e) {
          throw new BsonTranspilersRuntimeError(
            `Unable to convert datetime argument to integer: ${k.getText()}`
          );
        }
        if (isNaN(v)) {
          throw new BsonTranspilersRuntimeError(
            `Unable to convert datetime argument to integer: ${k.getText()}`
          );
        }
        return v;
      });
      /* month is 0-based in node, 1-based in everything else (afaict) */
      argvals[1]--;
      try {
        date = new Date(Date.UTC(...argvals));
      } catch (e) {
        throw new BsonTranspilersInternalError(
          `Unable to construct date from arguments: ${e.message}`
        );
      }
    }
    const dargs = `Date(${date
      ? this.Types._string.template(date.toUTCString())
      : ''})`;
    return this.generateCall(
      ctx, symbolType, [date, false], '', dargs, false, true
    );
  }

  processObjectIdfrom_datetime(ctx) {
    return this.generateObjectIdFromTime(ctx);
  }

  processBinary() {
    throw new BsonTranspilersUnimplementedError('Binary type not supported');
  }

  /*
   *
   * Helper Methods
   *
   */

  findPatternAndFlags(ctx, pythonFlags, targetFlags) {
    let pattern;

    const symbolType = this.Symbols.re.attr.compile;
    const argList = this.getArguments(ctx);
    const args = this.checkArguments(symbolType.args, argList, symbolType.id, symbolType.namedArgs);

    // Compile regex without flags
    const raw = this.getArgumentAt(ctx, 0).getText();
    let str = raw.replace(/^([rubf]?[rubf]["']|'''|"""|'|")/gi, '');
    str = str.replace(/(["]{3}|["]|[']{3}|['])$/, '');
    const input = `new RegExp(${raw.substr(-1)}${str}${raw.substr(-1)})`;
    try {
      const sandbox = {
        RegExp: RegExp
      };
      const context = new Context(sandbox);
      const regexobj = context.evaluate('__result = ' + input);
      context.destroy();
      pattern = regexobj.source;
    } catch (error) {
      throw new BsonTranspilersRuntimeError(error.message);
    }

    // Convert flags
    if (args.length === 1) {
      return [pattern, targetFlags.u];
    }

    let flagsArg = argList[1];
    flagsArg = this.skipFakeNodesDown(this.checkNamedArgs(
      [this.Types._integer], flagsArg, symbolType.namedArgs
    )[1]);
    let visited;
    if ('expr' in flagsArg.parentCtx) { // combine bitwise flags
      visited = flagsArg.xor_expr().map(f => this.visit(f));
    } else {
      visited = [this.visit(flagsArg)];
    }

    const translated = visited
      .map(f => pythonFlags[f])
      .filter(f => f !== undefined);

    if (visited.indexOf('256') === -1) { // default is unicode without re.A
      translated.push('u');
    }

    const target = translated
      .map(m => targetFlags[m])
      .filter(f => f !== undefined);

    const flags = target.sort().join('');
    return [pattern, flags];
  }


  /**
   * Want to throw unimplemented for comprehensions instead of reference errors.
   * @param {ParserRuleContext} ctx
   */
  testForComprehension(ctx) {
    if (ctx === null || ctx === undefined) {
      return;
    }
    if (
        ('comp_for' in ctx && ctx.comp_for() !== null) ||
        ('comp_if' in ctx && ctx.comp_if() !== null)
    ) {
      throw new BsonTranspilersUnimplementedError(
        'Comprehensions not yet implemented'
      );
    }
  }

  getParentUntil(ctx, name, steps) {
    steps = steps === undefined ? 0 : steps;
    let res = ctx;
    let found = false;
    const stack = [];
    while (res !== undefined && res !== null && !found) {
      if (name in res) {
        const goal = res[name]();
        if (goal === stack[stack.length - 1]) {
          found = true;
          break;
        }
      }
      stack.push(res);
      res = res.parentCtx;
    }
    return found ? stack[stack.length - 1 - steps] : false;
  }

  skipFakeNodesDown(ctx, goal) {
    let res = ctx;
    while (res.children !== undefined && res.children.length === 1) {
      res = res.children[0];
      if (goal && goal in res) {
        res = res[goal]();
        break;
      }
    }
    if (res.children === undefined) {
      return res.parentCtx;
    }
    return res;
  }

  skipFakeNodesUp(ctx, goal) {
    let res = ctx.parentCtx;
    while (res !== undefined && res !== null && res.children !== undefined &&
           res.children.length === 1) {
      if (goal && goal in res) {
        res = res[goal]();
        break;
      }
      res = res.parentCtx;
    }
    return res;
  }

  /**
   * Takes in the constructor name of a node and returns a human-readable
   * node name. Used for error reporting, must be defined by all visitors.
   *
   * @param {String} name
   * @return {String}
   */
  renameNode(name) {
    return name ? name.replace('_stmt', '') : 'Expression';
  }

  /**
   * If a named argument is passed in, then check against the 'namedArgs' array
   * instead of positionally.
   *
   * @param {Array} expected
   * @param {ParserRuleContext} node
   * @param {Object} namedArgs
   * @return {Array}
   */
  checkNamedArgs(expected, node, namedArgs) {
    const child = this.skipFakeNodesDown(node);
    if (namedArgs && 'test' in child && child.test().length > 1) {
      const name = child.test()[0].getText();
      const value = child.test()[1];
      const expectedType = namedArgs[name];
      if (expectedType === undefined) {
        throw new BsonTranspilersArgumentError(
          `Unknown named argument '${name}'`
        );
      }
      return [expectedType.type, value];
    }
    return [expected, node];
  }

  /*
   *
   * Accessor Functions.
   *
   * These MUST be defined by every visitor. Each function is a wrapper around
   * a tree node. They are required so that the CodeGenerationVisitor and the
   * Generators can access tree elements without needing to know which tree they
   * are visiting or the ANTLR name of the node.
   *
   */

  getArguments(ctx) {
    const trailer = ctx.paren_trailer();
    if (!('arglist' in trailer) || trailer.arglist() === null) {
      return [];
    }
    return trailer.arglist().argument();
  }

  getArgumentAt(ctx, i) {
    return this.getArguments(ctx)[i];
  }

  getFunctionCallName(ctx) {
    return ctx.atom();
  }

  getIfIdentifier(ctx) {
    if ('identifier' in ctx) {
      return ctx.identifier();
    }
    return ctx;
  }

  getAttributeLHS(ctx) {
    return ctx.atom();
  }

  getAttributeRHS(ctx) {
    return ctx.dot_trailer().identifier();
  }

  getList(ctx) {
    if (!('testlist_comp' in ctx) || !ctx.testlist_comp()) {
      return [];
    }
    return ctx.testlist_comp().test();
  }

  getArray(ctx) {
    return this.skipFakeNodesDown(ctx, 'array_literal');
  }

  getObject(ctx) {
    return this.skipFakeNodesDown(ctx, 'object_literal');
  }

  getKeyValueList(ctx) {
    if ('dictorsetmaker' in ctx && ctx.dictorsetmaker()) {
      const properties = ctx.dictorsetmaker().test();
      return properties
        .map((key, i) => {
          if (i % 2 === 0) {
            return [
              key,
              properties[i + 1]
            ];
          }
          return null;
        })
        .filter((k) => (k !== null));
    }
    return [];
  }

  getKeyStr(k) {
    return removeQuotes(this.visit(k[0]));
  }

  getValue(k) {
    return k[1];
  }

  isSubObject(ctx) {
    return this.getParentUntil(ctx.parentCtx, 'dictorsetmaker', 1);
  }

  getParentKeyStr(ctx) { // TODO: fix for long list
    // For a given sub document, get its key.
    const topNode = this.getParentUntil(ctx.parentCtx, 'dictorsetmaker', 1);
    const objNode = topNode.parentCtx;
    const index = objNode.test().indexOf(topNode);
    const keyNode = objNode.test()[index - 1];
    const key = this.visit(keyNode);
    return removeQuotes(key);
  }

  getObjectChild(ctx) {
    return this.skipFakeNodesDown(ctx);
  }
};

