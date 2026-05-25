// demo_api_ui/src/__tests__/McpFieldContext.test.js
import React from 'react';
import { render, act } from '@testing-library/react';
import { McpFieldProvider, useMcpField } from '../context/McpFieldContext';

function Consumer({ fieldKey }) {
  const { value, source } = useMcpField(fieldKey);
  return <div data-testid="val">{value}</div>;
}

function Writer({ fieldKey }) {
  const { setValue } = useMcpField(fieldKey);
  return (
    <button onClick={() => setValue('test-uuid', 'Step 2')}>write</button>
  );
}

function Wrapper({ children }) {
  return <McpFieldProvider>{children}</McpFieldProvider>;
}

test('value starts empty', () => {
  const { getByTestId } = render(
    <Wrapper><Consumer fieldKey="pingOneResourceId" /></Wrapper>
  );
  expect(getByTestId('val').textContent).toBe('');
});

test('setValue updates value and source reactively', () => {
  const { getByTestId, getByText } = render(
    <Wrapper>
      <Consumer fieldKey="pingOneResourceId" />
      <Writer fieldKey="pingOneResourceId" />
    </Wrapper>
  );
  act(() => { getByText('write').click(); });
  expect(getByTestId('val').textContent).toBe('test-uuid');
});

test('clear resets value to empty string', () => {
  function ClearConsumer() {
    const { value, setValue, clear } = useMcpField('pingOneResourceId');
    return (
      <>
        <div data-testid="val">{value}</div>
        <button onClick={() => setValue('abc', 'Step 2')}>write</button>
        <button onClick={clear}>clear</button>
      </>
    );
  }
  const { getByTestId, getByText } = render(
    <Wrapper><ClearConsumer /></Wrapper>
  );
  act(() => { getByText('write').click(); });
  expect(getByTestId('val').textContent).toBe('abc');
  act(() => { getByText('clear').click(); });
  expect(getByTestId('val').textContent).toBe('');
});

test('different keys are independent', () => {
  const { getAllByTestId, getByText } = render(
    <Wrapper>
      <Consumer fieldKey="pingOneResourceId" />
      <Consumer fieldKey="gatewayUrl" />
      <Writer fieldKey="pingOneResourceId" />
    </Wrapper>
  );
  act(() => { getByText('write').click(); });
  const vals = getAllByTestId('val');
  expect(vals[0].textContent).toBe('test-uuid');
  expect(vals[1].textContent).toBe('');
});

test('useMcpField throws when used outside provider', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<Consumer fieldKey="x" />)).toThrow();
  spy.mockRestore();
});
