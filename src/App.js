import * as React from 'react';
import { useState } from 'react';
import { JointWrapper, Tables } from './Components/TruthTable';
import { LogicForm } from './Components/LogicForm';
import './style.css';

// big thanks to https://online.stanford.edu/instructors/keith-schwarz
// for https://web.stanford.edu/class/cs103/tools/truth-table-tool/

export default function App() {
  const [input, setInput] = useState('');
  const [variables, setVariables] = useState([]);
  const [sentences, setSentences] = useState([]);
  const [updater, setUpdater] = useState(false);

  return (
    <div className="main">
      <h2>Generador de tablas</h2>
      <h3>Formato</h3>
      <table className="formatTable">
        <tr>
          <th>Simbolo</th>
          <th>Input</th>
        </tr>
        <tr>
          <td>¬</td>
          <td>no, ~</td>
        </tr>
        <tr>
          <td>∨</td>
          <td>o, \/, ||</td>
        </tr>
        <tr>
          <td>∧</td>
          <td>y, /\, &&</td>
        </tr>
        <tr>
          <td>→ </td>
          <td>{'=>, ->'}</td>
        </tr>
        <tr>
          <td>↔</td>
          <td>{'<=>, <->'}</td>
        </tr>
        <tr>
          <td>⊤</td>
          <td>T</td>
        </tr>
        <tr>
          <td>⊥</td>
          <td>F</td>
        </tr>
      </table>
      <br />
      <div id="formContainer">
        <LogicForm
          sentences={sentences}
          setsentences={setSentences}
          input={input}
          setInput={setInput}
        />
      </div>
      <div id="tableContainer">
        <Tables sentences={sentences} setSentences={setSentences} />
        <JointWrapper sentences={sentences} />
      </div>
    </div>
  );
}
