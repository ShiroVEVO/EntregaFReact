import * as React from 'react';
import { useState } from 'react';

export function Tables({ sentences, setSentences }) {
  function removeSentence(index) {
    let clone = sentences;
    clone.splice(index, 1);
    console.log(clone);
    setSentences(clone);
    setCheese(!cheese);
  }
  const [cheese, setCheese] = useState(true);

  let tables = [];
  for (let i in sentences) {
    let s = sentences[i];
    tables.push(
      <TableWrapper sentence={s} removeSentence={removeSentence} index={i} />
    );
  }

  return <div className="tablesContainer">{tables}</div>;
}

function getLogicType(s) {
  let n = s.vars.length;
  let assignments = [];
  for (let i = 0; i < Math.pow(2, n); i++) {
    assignments.push([]);
    for (let j = 0; j < n; j++) {
      let mod = Math.pow(2, n - j);
      let bool = i % mod < mod / 2 ? true : false;
      assignments[i].push(bool);
    }
  }

  let Tfound = false;
  let Ffound = false;
  for (let a of assignments) {
    let res = s.node.evaluate(a);
    if (res) {
      Tfound = true;
    } else {
      Ffound = true;
    }
  }

  if (Tfound) {
    if (Ffound) {
      return 1;
    }
    return 0;
  }
  return 2;
}

function TableWrapper({ sentence, removeSentence, index }) {
  const [show, setShow] = useState(false);
  const types = [
    ['Tautologia', '#20615B'],
    ['Contingencia', '#c2b41b'],
    ['Contradiccion', '#A21232'],
  ];
  function toggleShow() {
    setShow(!show);
  }

  let table = <div />;
  if (show) {
    table = <TruthTable sentence={sentence} />;
  }

  let type = getLogicType(sentence);

  return (
    <div>
      <div className="tableWrapper" onClick={toggleShow}>
        <div className="tableTitle">
          <div className="sentTitle">
            <div
              style={{
                fontWeight: 'bolder',
                color: '#A21232',
                float: 'left',
                paddingLeft: '10px',
              }}
              onClick={(e) => {
                removeSentence(index);
              }}
            >
              X
            </div>
            <div dangerouslySetInnerHTML={{ __html: `${sentence.format}` }} />
          </div>
          <div className="logicType" />
          <p className="logicType" style={{ color: types[type][1] }}>
            {types[type][0]}
          </p>
        </div>
        <div>{table}</div>
      </div>
    </div>
  );
}

function TruthTable({ sentence }) {
  if (sentence.vars == null) {
    return <div />;
  }
  let n = sentence.vars.length;
  let assignments = [];
  for (let i = 0; i < Math.pow(2, n); i++) {
    assignments.push([]);
    for (let j = 0; j < n; j++) {
      let mod = Math.pow(2, n - j);
      let bool = i % mod < mod / 2 ? true : false;
      assignments[i].push(bool);
    }
  }

  let ssnodes = [];
  let queue = [sentence.node];
  while (queue.length > 0) {
    let n = queue.shift();
    if (n.hasOwnProperty('index')) {
      continue;
    }
    ssnodes.push(n);
    if (n.hasOwnProperty('lhs')) {
      queue.push(n.rhs);
      queue.push(n.lhs);
      continue;
    }
    if (n.hasOwnProperty('underlying')) {
      queue.push(n.underlying);
      continue;
    }
  }

  let ss = [];
  let tv = [...Array(assignments.length)].map((_) =>
    Array(ssnodes.length).fill(0)
  );
  for (let i = 0; i < ssnodes.length; i++) {
    let n = ssnodes[i];
    ss.push(n.toString(sentence.vars));
    for (let j = 0; j < assignments.length; j++) {
      tv[j][i] = n.evaluate(assignments[j]);
    }
  }
  let header = [];
  for (let v of sentence.vars) {
    header.push(<TableCellHeader val={v} />);
  }
  for (let s of ss) {
    header.push(<TableCellHeader val={s} />);
  }

  let rows = [];
  for (let i = 0; i < tv.length; i++) {
    let r = tv[i];
    r = assignments[i].concat(r);
    rows.push(<TableRow row={r} />);
  }

  return (
    <table className="truthTable">
      <tr>{header}</tr>
      {rows}
    </table>
  );
}

function TableCellHeader({ val }) {
  return (
    <td>
      <div dangerouslySetInnerHTML={{ __html: `${val}` }} />
    </td>
  );
}

function TableCell({ val }) {
  return (
    <td
      style={{
        backgroundColor: val ? '#20615B' : '#A21232',
      }}
    >
      {val ? 'T' : 'F'}
    </td>
  );
}

function TableRow({ row }) {
  let rows = [];
  for (let v of row) {
    rows.push(<TableCell val={v} />);
  }

  return <tr>{rows}</tr>;
}

export function JointWrapper({ sentences }) {
  const [show, setShow] = useState(false);
  const types = [
    ['doble xd', '#20615B'],
    ['Sin proposiciones', '#c2b41b'],
    ['wtf', '#A21232'],
  ];
  function toggleShow() {
    setShow(!show);
  }

  let table = <div />;
  if (show) {
    table = <JointTable sentences={sentences} />;
  }

  let type = getJointType(sentences);
  return (
    <div className="tableWrapper" onClick={toggleShow}>
      <div className="tableTitle">
        <p style={{ color: types[type][1] }}>{types[type][0]}</p>
      </div>
      <div>{table}</div>
    </div>
  );
}

function getJointType(sentences) {
  if (sentences.length == 0) {
    return 1;
  }
  let vars = [];
  for (let s of sentences) {
    for (let v of s.vars) {
      if (vars.includes(v)) {
        continue;
      }
      vars.push(v);
    }
  }
  let n = vars.length;
  let assignments = [];
  for (let i = 0; i < Math.pow(2, n); i++) {
    assignments.push([]);
    for (let j = 0; j < n; j++) {
      let mod = Math.pow(2, n - j);
      let bool = i % mod < mod / 2 ? true : false;
      assignments[i].push(bool);
    }
  }

  let varDic = {};
  for (let i = 0; i < vars.length; i++) {
    varDic[vars[i]] = i;
  }
  let sat = false;
  for (let j = 0; j < assignments.length; j++) {
    let trueRowFound = true;
    for (let i = 0; i < sentences.length; i++) {
      let n = sentences[i];
      let assignment = [];
      for (let v of n.vars) {
        assignment.push(assignments[j][varDic[v]]);
      }
      trueRowFound = trueRowFound && n.node.evaluate(assignment);
    }
    sat = sat || trueRowFound;
  }
  if (sat) {
    return 0;
  }
  return 2;
}

function JointTable({ sentences }) {
  if (sentences.length == 0) {
    return <div> </div>;
  }
  let vars = [];
  for (let s of sentences) {
    for (let v of s.vars) {
      if (vars.includes(v)) {
        continue;
      }
      vars.push(v);
    }
  }
  let n = vars.length;
  let assignments = [];
  for (let i = 0; i < Math.pow(2, n); i++) {
    assignments.push([]);
    for (let j = 0; j < n; j++) {
      let mod = Math.pow(2, n - j);
      let bool = i % mod < mod / 2 ? true : false;
      assignments[i].push(bool);
    }
  }

  let header = [];
  for (let v of vars) {
    header.push(<TableCellHeader val={v} />);
  }
  for (let s of sentences) {
    header.push(<TableCellHeader val={s.format} />);
  }

  let tv = [...Array(assignments.length)].map((_) =>
    Array(sentences.length).fill(0)
  );

  let varDic = {};
  for (let i = 0; i < vars.length; i++) {
    varDic[vars[i]] = i;
  }

  for (let i = 0; i < sentences.length; i++) {
    let n = sentences[i];
    for (let j = 0; j < assignments.length; j++) {
      //get only vars in sentence
      let assignment = [];
      for (let v of n.vars) {
        assignment.push(assignments[j][varDic[v]]);
      }
      tv[j][i] = n.node.evaluate(assignment);
    }
  }

  let rows = [];
  for (let i = 0; i < tv.length; i++) {
    let r = tv[i];
    r = assignments[i].concat(r);
    rows.push(<TableRow row={r} />);
  }

  return (
    <table className="truthTable">
      <tr>{header}</tr>
      {rows}
    </table>
  );
}
