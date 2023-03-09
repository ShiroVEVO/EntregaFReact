import * as React from 'react';
import { parse } from './parser';

export function LogicForm({ sentences, setsentences, input, setInput }) {
  const handleSubmit = (event) => {
    event.preventDefault();

    let output = { ast: null, variables: null };
    try {
      output = parse(input);
    } catch (error) {
      console.log(error);
      setInput('Error en la proposición');
      return;
    }

    let formatString = output.ast.toString(output.variables);
    let newSentence = {
      plain: input.plain,
      format: formatString,
      node: output.ast,
      vars: output.variables,
    };

    let newsentences = sentences;
    newsentences.push(newSentence);
    setsentences(newsentences);
    setInput('');
  };

  return (
    <div className="formContainer">
      <form onSubmit={handleSubmit}>
        <label>
          <h4 style={{ margin: '10px' }}>Ingrese una proposición logica</h4>
          <input
            className="textBox"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <br />
        <input className="fancybutton" type="submit" value="Agregar" />
      </form>
    </div>
  );
}
