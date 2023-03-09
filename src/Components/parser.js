/******************************************************************************
 * File: parser.js
 * Author: Keith Schwarz (htiek@cs.stanford.edu)
 *
 * A parser that produces an AST from a sequence of tokens.
 */

/* Function: parse
 *
 * Given an input string, parses it to produce an AST and variable map. If
 * successful, the returned object will have these fields:
 *
 *   ast:       The root of the generated AST.
 *   variables: A map from indices to variables.
 *
 * On failure, this function throws an exception with these fields:
 *
 *   description: What went wrong?
 *   start:       Start index of the syntax error.
 *   end:         End index of the syntax error.
 */
var kScannerConstants = {
  EOF: '$', // EOF marker placed internally in the string
};

export function parse(input) {
  /* Scan the input to get the tokens and the variable map. */

  var scanResult = scan(input);
  var tokens = scanResult.tokens;

  /* Use Dijkstra's shunting-yard algorithm to convert from infix to postfix,
   * building the AST as we go. This means we need to track the operators and
   * operands (where the operands stack also includes parentheses.)
   *
   * The ~ operator is odd in that it modifies something we haven't seen yet.
   * To handle this, we push it onto the operands stack. Whenever we read
   * an operand, we repeatedly pop off negations until none remain.
   */
  var operators = [];
  var operands = [];

  /* We can be in one of two different states:
   *
   *  needOperand: We're expecting something that ultimately evaluates to an expression. This can be
   *               T, F, a variable, a negation of something, or a parenthesis.
   * !needOperand: We've got the operand, and now we're expecting an operator to be applied to it. We
   *               can also get a close parenthesis.
   *
   */
  var needOperand = true;

  /* Scan across the tokens! */
  for (var i in tokens) {
    var currToken = tokens[i];

    if (needOperand) {
      /* If it's an operand, push it on the operand stack. */
      if (isOperand(currToken)) {
        addOperand(wrapOperand(currToken), operands, operators);
        needOperand = false;
      } else if (currToken.type === '(' || currToken.type === '~') {
        /* If it's a parenthesis or negation, push it on the parenthesis stack. We're
         * still expecting an operand.
         */
        operators.push(currToken);
      } else if (currToken.type === kScannerConstants.EOF) {
        /* It's also possible that we have hit the end of the input. This is an error,
         * but to be nice, we'll give a more specific error condition.
         */
        /* If the operator stack is empty, the input was empty. */
        if (operators.length === 0) {
          parseError('', 0, 0);
        }

        /* If the operator stack has an ( on top, there's an unmatched open parenthesis. */
        if (topOf(operators).type === '(') {
          parseError(
            'This open parenthesis has no matching close parenthesis.',
            topOf(operators).start,
            topOf(operators).end
          );
        }

        /* Otherwise, it's an operator with no operand. */
        parseError(
          'This operator is missing an operand.',
          topOf(operators).start,
          topOf(operators).end
        );
      } else {
        /* Anything else is a parse error. */
        parseError(
          'We were expecting a variable, constant, or open parenthesis here.',
          currToken.start,
          currToken.end
        );
      }
    } else {
      /* Otherwise, we're expecting either an operator or a close parenthesis. */
      /* If this is an operator, eagerly evaluate operators until this one
       * has priority no lower than what comes before it. As a trick/hack, we
       * treat EOF as an operator with lowest priority, so upon hitting EOF
       * we forcibly evaluate everything.
       */
      if (
        isBinaryOperator(currToken) ||
        currToken.type === kScannerConstants.EOF
      ) {
        /* While there are higher-priority operators atop the stack,
         * evaluate them.
         */
        while (true) {
          /* If there are no more operands to evaluate, we're done. */
          if (operators.length === 0) break;

          /* If it's an open parenthesis, we should stop because the current
           * operator is being parenthesized for later us.
           */
          if (topOf(operators).type === '(') break;

          /* Compare the priority of the stack top to the priority of the current
           * operator. We stop if the new operator has priority greater than or
           * equal to the current operator to ensure rightmost grouping.
           */
          if (priorityOf(topOf(operators)) <= priorityOf(currToken)) break;

          /* Otherwise, evaluate the operator atop the stack. */
          var operator = operators.pop();
          var rhs = operands.pop();
          var lhs = operands.pop();

          addOperand(
            createOperatorNode(lhs, operator, rhs),
            operands,
            operators
          );
        }

        /* Now, push this operator onto the operators stack. */
        operators.push(currToken);

        /* We just read our operator, so now we're expecting an operand. */
        needOperand = true;

        /* At this point, if we got EOF, stop. */
        if (currToken.type === kScannerConstants.EOF) break;
      } else if (currToken.type === ')') {
        /* If this is a close parenthesis, we pop operators from the stack and
         * evaluate them until we come to an open parenthesis. We then still are
         * searching for an operator.
         */
        /* Keep popping operators until we get a close parenthesis. */
        while (true) {
          /* If we ran out of operators, we have a mismatched parenthesis. */
          if (operators.length === 0) {
            parseError(
              "This close parenthesis doesn't match any open parenthesis.",
              currToken.start,
              currToken.end
            );
          }
          var currOp = operators.pop();

          /* If the top of the stack is an open parenthesis, we should have the
           * top of the operand stack containing our value, so we're done.
           */
          if (currOp.type === '(') break;

          /* Otherwise, if the top of the stack is a negation, we have a syntax error. */
          if (currOp.type === '~') {
            parseError(
              'Nothing is negated by this operator.',
              currOp.start,
              currOp.end
            );
          }

          /* Otherwise, it should be an operator. Evaluate it. */
          var rhs = operands.pop();
          var lhs = operands.pop();

          addOperand(createOperatorNode(lhs, currOp, rhs), operands, operators);
        }

        /* At this point, the stack top contains the operand produced from the parenthesized
         * expression, but we didn't expose it to any negations. Therefore, we'll pop it and
         * add it back through addOperand.
         */
        var expr = operands.pop();
        addOperand(expr, operands, operators);
      } else {
        /* Anything else is an error. */
        parseError(
          'We were expecting a close parenthesis or a binary connective here.',
          currToken.start,
          currToken.end
        );
      }
    }
  }

  /* We've now successfully parsed the input, but there may be extra junk on
   * the stack to worry about. We'll handle that here.
   */

  /* These are effectively asserts that the top of the stack is EOF; they
   * should never fail unless there's an error case we forgot to handle
   * above.
   */
  assert(
    operators.length !== 0,
    'No operators on the operator stack (logic error in parser?)'
  );
  assert(
    operators.pop().type === kScannerConstants.EOF,
    'Stack top is not EOF (logic error in parser?)'
  );

  /* The operators stack should now be empty. */
  if (operators.length !== 0) {
    /* The top should be an open parenthesis, since EOF would have evicted
     * anything else.
     */
    var mismatchedOp = operators.pop();
    assert(
      mismatchedOp.type === '(',
      'Somehow missed an operator factoring in EOF (logic error in parser?)'
    );

    parseError(
      'No matching close parenthesis for this open parenthesis.',
      mismatchedOp.start,
      mismatchedOp.end
    );
  }

  /* If we're here, we did the parse successfully! The top of the operands stack is our
   * AST root, and the information from the scan gives us the variables map.
   */
  return {
    ast: operands.pop(),
    variables: scanResult.variables,
  };
}

/* Function: addOperand
 *
 * Adds a new operand to the operands stack, evaluating any negations that need to be
 * performed first.
 */
export function addOperand(node, operands, operators) {
  /* Keep evaluating negate operators until none remain. */
  while (operators.length > 0 && topOf(operators).type === '~') {
    operators.pop();
    node = new negateNode(node);
  }

  /* At this point, we've negated as much as possible. Add the new AST node
   * to the operands stack.
   */
  operands.push(node);
}

/* Function: isOperand
 *
 * Returns whether the given token is an operand. The operands are T, F, and variables.
 */
export function isOperand(token) {
  return token.type === 'T' || token.type === 'F' || token.type === 'variable';
}

/* Function: wrapOperand
 *
 * Given an operand token, returns an AST node encapsulating that operand.
 */
export function wrapOperand(token) {
  if (token.type === 'T') return new trueNode();
  if (token.type === 'F') return new falseNode();
  if (token.type === 'variable') return new variableNode(token.index);
  unreachable('Token ' + token.type + " isn't an operand.");
}

/* Function: isBinaryOperator
 *
 * Given a token, reports whether the token is a binary operator.
 */
export function isBinaryOperator(token) {
  return (
    token.type === '<->' ||
    token.type === '->' ||
    token.type === '/\\' ||
    token.type === '\\/'
  );
}

/* Function: priorityOf
 *
 * Returns the priority of the given operator. We pretend that EOF is an operator
 * with minimal priority to ensure that when EOF is seen, we pop off all remaining
 * operators.
 */
export function priorityOf(token) {
  if (token.type === kScannerConstants.EOF) return -1;
  if (token.type === '<->') return 0;
  if (token.type === '->') return 1;
  if (token.type === '\\/') return 2;
  if (token.type === '/\\') return 3;
  unreachable('Should never need the priority of ' + token.type);
}

/* Function: createOperatorNode
 *
 * Given the LHS and RHS of an expression and the token reprsenting the operator,
 * creates an AST node corresponding to that operator.
 */
export function createOperatorNode(lhs, token, rhs) {
  if (token.type === '<->') return new iffNode(lhs, rhs);
  if (token.type === '->') return new impliesNode(lhs, rhs);
  if (token.type === '\\/') return new orNode(lhs, rhs);
  if (token.type === '/\\') return new andNode(lhs, rhs);
  unreachable(
    'Should never need to create an operator node from ' + token.type
  );
}

/* Function: topOf
 *
 * Returns the last element of an array.
 */
export function topOf(array) {
  assert(array.length !== 0, "Can't get the top of an empty array.");
  return array[array.length - 1];
}

/* Function: parseError
 *
 * Triggers a failure of the parser on the specified range of characters.
 */
export function parseError(why, start, end) {
  throw { description: why, start: start, end: end };
}

/******************************************************************************
 * File: scanner.js
 * Author: Keith Schwarz (htiek@cs.stanford.edu)
 *
 * A scanner to convert expressions from text into a propositional logic token
 * stream and associated variable <-> index map.
 *
 * The tokens can be any of these operators:
 *
 *    /\   \/  ->  <->  ~
 *
 * They can also be the special symbols T and F, parentheses, variables, or a
 * special EOF marker.
 */

/* Function: scan(input)
 *
 * Scans the input string and produces an object with two fields:
 *
 *   tokens:    A list of the tokens in the input, in order.
 *   variables: A list of the variables keyed by their index. See below.
 *
 * For simplicity, each variable is replaced by a numeric code based on its
 * alphabetical index. For example, if the variables are p, q, and r, then
 * p would get value 0, q would get value 1, and r would get value 2. The
 * "variables" array would then be ["p", "q", "r"].
 *
 * The final token in the stream will be the token EOF, which the parser can then
 * use as needed.
 *
 * If a lexical error occurs, an error object is thrown. The error will contain
 * this information:
 *
 *   description: A human-readable description of the error.
 *   start:       The index into the string at which the error starts (inclusive).
 *   end:         The index into the string at which the error ends (exclusive).
 */
export function scan(input) {
  /* Check that the input does not contain any invalid characters. */
  checkIntegrity(input);

  /* Get a preliminary scan in which variables are named rather than
   * numbered.
   */
  var preliminary = preliminaryScan(input);

  /* Convert the preliminary scan into the result by sorting variables by
   * name and renumbering them.
   */
  return numberVariables(preliminary);
}

/* Function: preliminaryScan
 *
 * Does a preliminary scan of the input. The preliminary scan is identical to
 * the final scan, except that the variables are named rather than numbered.
 * The returned object will have two fields:
 *
 *    tokens:      The tokens in the input.
 *    variableSet: A dictionary of all the tokens named in the input.
 */
export function preliminaryScan(input) {
  /* Append a special $ marker to the end of the input. This will serve as our
   * EOF marker and eliminates a lot of special cases in input handling.
   */
  input += kScannerConstants.EOF;

  /* Run the scan! */
  var i = 0; // Index into the string
  var variableSet = {}; // Set of variables in use
  var tokens = []; // List of tokens

  while (true) {
    var curr = input.charAt(i); // Current character

    /* Stop on EOF if we find it. */
    if (curr === kScannerConstants.EOF) {
      tokens.push(makeIdentityToken(curr, i));
      return {
        tokens: tokens,
        variableSet: variableSet,
      };
    } else if (isVariableStart(input, i)) {
      /* If we're reading a variable, pull the whole variable. */
      /* We're going to do variables in a two-step process. First, we're going to
       * read the variables and store them by name. Afterwards, we'll postprocess
       * them to replace each variable name with its index.
       */
      var variable = scanVariable(input, i, variableSet);
      tokens.push(makeVariableToken(variable, i, i + variable.length));

      /* Skip past the token characters. */
      i += variable.length;
    } else if (isOperatorStart(input, i)) {
      /* If we're reading an operator or other piece of syntax, pull the whole operator. */
      var token = tryReadOperator(input, i);
      /* token should not be null here. */

      tokens.push(makeIdentityToken(token, i));

      /* Skip the characters we just read. */
      i += token.length;
    } else if (isWhitespace(input.charAt(i))) {
      /* If we're reading whitespace, just skip it. */
      i++;
    } else {
      scannerFail(
        'The character ' + input.charAt(i) + " shouldn't be here.",
        i,
        i + 1
      );
    }
  }
}

/* Function: makeIdentityToken
 *
 * Given a string that is its own token type, wraps that string up as a token for
 * the scanner.
 */
export function makeIdentityToken(str, index) {
  return { type: translate(str), start: index, end: index + str.length };
}

/* Function: makeVariableToken
 *
 * Given a variable index, creates a token holding that variable index.
 */
export function makeVariableToken(varIndex, start, end) {
  return { type: 'variable', index: varIndex, start: start, end: end };
}

/* Function: isVariableStart
 *
 * Given the input to scan and an offset into that input, determines whether the
 * input beginning at that input is the name of a variable.
 *
 * Variable names must start with a letter or underscore, consist of letters and
 * underscores, and not be identically T or F.
 */
export function isVariableStart(input, index) {
  return tryReadVariableName(input, index) !== null;
}

/* Function: tryReadVariableName
 *
 * Tries to read the name of a variable starting at the given index in the string.
 * If a variable name can be read, it is returned. If not, this export function returns
 * null.
 */
export function tryReadVariableName(input, index) {
  /* Need to start with a letter or underscore. */
  if (!/[A-Za-z_]/.test(input.charAt(index))) return null;

  /* Keep reading characters while it's possible to do so. */
  var result = '';
  while (/[A-Za-z_0-9]/.test(input.charAt(index))) {
    result += input.charAt(index);
    index++;
  }

  /* Return the result as long as it isn't a reserved word. */
  return isReservedWord(result) ? null : result;
}

/* Function: isReservedWord
 *
 * Returns whether the specified token is a reserved word.
 */
export function isReservedWord(token) {
  return (
    token === 'T' ||
    token === 'F' ||
    token === 'and' ||
    token === 'or' ||
    token === 'not' ||
    token === 'iff' ||
    token === 'implies' ||
    token === 'true' ||
    token === 'false'
  );
}

/* Function: scanVariable
 *
 * Given the string to scan, a start offset, and the variables list, scans a
 * variable out of the stream, adds it to the variable set, and returns the
 * name of the variable.
 *
 * It's assumed that we are indeed looking at a variable, so no error-handling
 * is done here.
 */
export function scanVariable(input, index, variableSet) {
  var variableName = tryReadVariableName(input, index);
  /* variableName should not be null here, by contract. */

  variableSet[variableName] = true;
  return variableName;
}

/* Function: isOperatorStart
 *
 * Given the input to scan and a start index, returns whether there's an operator
 * at the current position.
 */
export function isOperatorStart(input, index) {
  return tryReadOperator(input, index) !== null;
}

/* Function: tryReadOperator
 *
 * Given the input to scan and a start index, returns the operator at the current
 * index if one exists, and null otherwise.
 */
export function tryReadOperator(input, index) {
  /* TODO: Clean this up a bit? This was fine when we had only a few symbols, but
   * with the addition of the LaTeX operators this is getting a bit unwieldy.
   */

  /* Look in reverse order of length so that we use maximal-munch. */
  /* Case 1: Fifteen-character operators. */
  if (index < input.length - 14) {
    var fifteenChars = input.substring(index, index + 15);
    if (
      fifteenChars === '\\leftrightarrow' ||
      fifteenChars === '\\Leftrightarrow'
    ) {
      return fifteenChars;
    }
  }

  /* Case 2: Eleven-character operators. */
  if (index < input.length - 10) {
    var elevenChars = input.substring(index, index + 11);
    if (elevenChars === '\\rightarrow' || elevenChars === '\\Rightarrow') {
      return elevenChars;
    }
  }

  /* Case 3: Seven-character operators like "implies" */
  if (index < input.length - 6) {
    var sevenChars = input.substring(index, index + 7);
    if (sevenChars === 'implies') {
      return sevenChars;
    }
  }

  /* Case 4: Six-character operators */
  if (index < input.length - 5) {
    var sixChars = input.substring(index, index + 6);
    if (sixChars === '\\wedge') {
      return sixChars;
    }
  }

  /* Case 5: Five-character operators like "false" */
  if (index < input.length - 4) {
    var fiveChars = input.substring(index, index + 5);
    if (
      fiveChars === 'false' ||
      fiveChars === '\\lnot' ||
      fiveChars === '\\lneg' ||
      fiveChars === '\\land'
    ) {
      return fiveChars;
    }
  }

  /* Case 6: Four-character operators like "true" */
  if (index < input.length - 3) {
    var fourChars = input.substring(index, index + 4);
    if (
      fourChars === 'true' ||
      fourChars === '\\top' ||
      fourChars === '\\bot' ||
      fourChars === '\\lor' ||
      fourChars === '\\vee' ||
      fourChars === '\\neg'
    ) {
      return fourChars;
    }
  }

  /* Case 7: Three-char operators like <-> */
  if (index < input.length - 2) {
    var threeChars = input.substring(index, index + 3);
    if (
      threeChars === '<->' ||
      threeChars === 'and' ||
      threeChars === '<=>' ||
      threeChars === 'not' ||
      threeChars === 'iff' ||
      threeChars === '\\to'
    ) {
      return threeChars;
    }
  }

  /* Case 8: Two-char operator like ->, /\, \/ */
  if (index < input.length - 1) {
    var twoChars = input.substring(index, index + 2);
    if (
      twoChars === '/\\' ||
      twoChars === '\\/' ||
      twoChars === '->' ||
      twoChars === '&&' ||
      twoChars === '||' ||
      twoChars === 'or' ||
      twoChars === '=>'
    ) {
      return twoChars;
    }
  }

  /* Case 9: Single-char operator like (, ), ~, T, F. */
  if (
    /[()~TF^!\u2227\u2228\u2192\u2194\u22A4\u22A5\u00AC]/.test(
      input.charAt(index)
    )
  ) {
    return input.charAt(index);
  }

  /* If we got here, nothing matched. */
  return null;
}

/* Function: translate
 *
 * Translates a lexeme into its appropriate token type. This is used, for example, to map
 * & and | to /\ and \/.
 */
export function translate(input) {
  if (
    input === '&&' ||
    input === 'and' ||
    input === '\u2227' ||
    input === '\\land' ||
    input === '\\wedge' ||
    input === '^'
  )
    return '/\\';
  if (
    input === '||' ||
    input === 'or' ||
    input === '\u2228' ||
    input === '\\lor' ||
    input === '\\vee'
  )
    return '\\/';
  if (
    input === '=>' ||
    input === '\u2192' ||
    input === 'implies' ||
    input === '\\to' ||
    input === '\\rightarrow' ||
    input === '\\Rightarrow'
  )
    return '->';
  if (
    input === '<=>' ||
    input === '\u2194' ||
    input === 'iff' ||
    input === '\\leftrightarrow' ||
    input === '\\Leftrightarrow'
  )
    return '<->';
  if (
    input === 'not' ||
    input === '!' ||
    input === '\u00AC' ||
    input === '\\lnot' ||
    input === '\\neg'
  )
    return '~';
  if (input === '\u22A4' || input === 'true' || input === '\\top') return 'T';
  if (input === '\u22A5' || input === 'false' || input === '\\bot') return 'F';
  return input;
}

/* Function: isWhitespace
 *
 * Returns whether the given character is whitespace.
 */
export function isWhitespace(char) {
  return /\s/.test(char);
}

/* Function: scannerFail
 *
 * Triggers a failure of the scanner on the specified range of characters.
 */
export function scannerFail(why, start, end) {
  throw { description: why, start: start, end: end };
}

/* Function: checkIntegrity
 *
 * Checks the integrity of the input string by scanning for disallowed characters.
 * If any disallowed characters are present, triggers an error.
 */
export function checkIntegrity(input) {
  var okayChars =
    /[A-Za-z_0-9\\\/<>\-~^()\s\&\|\=\!\u2227\u2228\u2192\u2194\u22A4\u22A5\u00AC]/;
  for (var i = 0; i < input.length; i++) {
    if (!okayChars.test(input.charAt(i))) {
      scannerFail('Illegal character', i, i + 1);
    }
  }
}

/* Function: numberVariables
 *
 * Given the result of a preliminary scan, sorts the variables and renumbers them
 * alphabetically.
 *
 * The returned object has two fields:
 *
 *    tokens:    The tokens from the scan, with variables numbered.
 *    variables: An array mapping numbers to variable names.
 */
export function numberVariables(preliminary) {
  /* Add all the variables from the dictionary to an array so we can sort. */
  var variables = [];
  for (var key in preliminary.variableSet) {
    variables.push(key);
  }

  /* Sort the variables alphabetically. */
  variables.sort();

  /* Invert the array into the variable set for quick lookups. */
  for (var i = 0; i < variables.length; i++) {
    preliminary.variableSet[variables[i]] = i;
  }

  /* Change each variable's name to its index. */
  for (var j = 0; j < preliminary.tokens.length; j++) {
    if (preliminary.tokens[j].type === 'variable') {
      preliminary.tokens[j].index =
        preliminary.variableSet[preliminary.tokens[j].index];
    }
  }

  return {
    tokens: preliminary.tokens,
    variables: variables,
  };
}

/******************************************************************************
 * File: ast.js
 * Author: Keith Schwarz (htiek@cs.stanford.edu)
 *
 * Types representing AST nodes in a parse tree.
 */

/* All AST nodes must have functions of the form
 *
 *   evaluate(assignment), which returns the value of the expression given the
 *                         variable assignment as an array of trues and falses.
 *   toString(variables),  which produces a human-readable representation of the
 *                         AST rooted at the node given the variables information.
 *                         in variables. The expression should have parentheses
 *                         added as appropriate.
 */

/*** Node type for T. ***/
export function trueNode() {}

trueNode.prototype.evaluate = function (assignment) {
  return true;
};
trueNode.prototype.toString = function (variables) {
  return '&#8868;';
};

/*** Node type for F. ***/
export function falseNode() {}

falseNode.prototype.evaluate = function (assignment) {
  return false;
};
falseNode.prototype.toString = function (variables) {
  return '&#8869;';
};

/*** Node type for ~. ***/
export function negateNode(underlying) {
  this.underlying = underlying;
}

/* To evaluate ~, we evaluate the underlying expression and negate the result. */
negateNode.prototype.evaluate = function (assignment) {
  return !this.underlying.evaluate(assignment);
};
negateNode.prototype.toString = function (variables) {
  return '&not;' + this.underlying.toString(variables);
};

/*** Node type for /\ ***/
export function andNode(lhs, rhs) {
  this.lhs = lhs;
  this.rhs = rhs;
}

andNode.prototype.evaluate = function (assignment) {
  return this.lhs.evaluate(assignment) && this.rhs.evaluate(assignment);
};
andNode.prototype.toString = function (variables) {
  return (
    '(' +
    this.lhs.toString(variables) +
    ' &and; ' +
    this.rhs.toString(variables) +
    ')'
  );
};

/*** Node type for \/ ***/
export function orNode(lhs, rhs) {
  this.lhs = lhs;
  this.rhs = rhs;
}

orNode.prototype.evaluate = function (assignment) {
  return this.lhs.evaluate(assignment) || this.rhs.evaluate(assignment);
};
orNode.prototype.toString = function (variables) {
  return (
    '(' +
    this.lhs.toString(variables) +
    ' &or; ' +
    this.rhs.toString(variables) +
    ')'
  );
};

/*** Node type for -> ***/
export function impliesNode(lhs, rhs) {
  this.lhs = lhs;
  this.rhs = rhs;
}

/* Use the equivalcen p -> q   ===   ~p \/ q */
impliesNode.prototype.evaluate = function (assignment) {
  return !this.lhs.evaluate(assignment) || this.rhs.evaluate(assignment);
};
impliesNode.prototype.toString = function (variables) {
  return (
    '(' +
    this.lhs.toString(variables) +
    ' &rarr; ' +
    this.rhs.toString(variables) +
    ')'
  );
};

/*** Node type for <-> ***/
export function iffNode(lhs, rhs) {
  this.lhs = lhs;
  this.rhs = rhs;
}

iffNode.prototype.evaluate = function (assignment) {
  return this.lhs.evaluate(assignment) === this.rhs.evaluate(assignment);
};
iffNode.prototype.toString = function (variables) {
  return (
    '(' +
    this.lhs.toString(variables) +
    ' &harr; ' +
    this.rhs.toString(variables) +
    ')'
  );
};

/*** Node type for variables ***/
export function variableNode(index) {
  this.index = index;
}

/* The value of a variable is given by taking the value given to that variable
 * in the explicit assignment.
 */
variableNode.prototype.evaluate = function (assignment) {
  return assignment[this.index];
};
variableNode.prototype.toString = function (variables) {
  return variables[this.index];
};

/* Function: assert
 *
 * Asserts that the given claim is true, throwing an exception if it isn't.
 */
export function assert(expr, what) {
  if (expr === false) {
    throw new Error('Assertion failed: ' + what);
  }
}

/* Function: unreachable
 *
 * Triggers a failure and reports an error
 */
export function unreachable(why) {
  throw new Error('Unreachable code: ' + why);
}
