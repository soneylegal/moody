import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login page when unauthenticated', () => {
  render(<App />);
  const heading = screen.getByText(/Entrar/i);
  expect(heading).toBeInTheDocument();
});
