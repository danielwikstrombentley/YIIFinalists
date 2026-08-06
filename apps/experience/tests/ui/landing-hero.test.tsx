import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingHero } from '../../src/ui/LandingHero.js';

const PROJECT = {
  id: 'corridor-project',
  name: 'River Link Resilience',
  organisation: 'YII Sample Organisation',
  location: 'Northern River Corridor',
};

describe('LandingHero', () => {
  it('renders only the approved landing identity while projectLanding is active', () => {
    render(<LandingHero state="projectLanding" project={PROJECT} />);

    const hero = screen.getByTestId('landing-hero');
    expect(hero).toHaveAttribute('data-project-id', PROJECT.id);
    expect(hero).toHaveTextContent(PROJECT.name);
    expect(hero).toHaveTextContent(PROJECT.organisation);
    expect(hero).toHaveTextContent(PROJECT.location);
    expect(screen.queryByTestId('story-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('voiceover-caption')).not.toBeInTheDocument();
  });

  it('renders nothing outside the landing state or without a resolved project', () => {
    const { rerender } = render(<LandingHero state="transitionToProject" project={PROJECT} />);
    expect(screen.queryByTestId('landing-hero')).not.toBeInTheDocument();

    rerender(<LandingHero state="projectLanding" project={null} />);
    expect(screen.queryByTestId('landing-hero')).not.toBeInTheDocument();
  });
});