import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_EVALUATOR_REGISTRY,
  evaluateAssessment,
} from '../../src/shared/assessmentEvaluators'

describe('published assessment evaluators', () => {
  it('publishes stable, callable evaluator records', () => {
    expect(ASSESSMENT_EVALUATOR_REGISTRY).toEqual([
      expect.objectContaining({
        id: 'EVAL-finite-choice-v1',
        status: 'stable',
        authorities: ['finite-auto'],
        responseTypes: ['choice'],
      }),
      expect.objectContaining({
        id: 'EVAL-normalized-short-v1',
        status: 'stable',
        authorities: ['normalized-auto'],
        responseTypes: ['normalized-short'],
      }),
    ])
    for (const evaluator of ASSESSMENT_EVALUATOR_REGISTRY) {
      expect(evaluator.invocation).toEqual({
        module: 'src/shared/assessmentEvaluators.ts',
        export: 'evaluateAssessment',
        runtime: 'ctx.assessment.evaluate',
      })
    }
  })

  it('keeps finite choices exact after trimming', () => {
    expect(evaluateAssessment({
      evaluatorId: 'EVAL-finite-choice-v1',
      input: ' A ',
      acceptedValues: ['A'],
    }).status).toBe('pass')
    expect(evaluateAssessment({
      evaluatorId: 'EVAL-finite-choice-v1',
      input: 'a',
      acceptedValues: ['A'],
    }).status).toBe('fail')
  })

  it('normalizes Unicode, case, and whitespace for short answers', () => {
    expect(evaluateAssessment({
      evaluatorId: 'EVAL-normalized-short-v1',
      input: '  Ａ   B  ',
      acceptedValues: ['a b'],
    })).toMatchObject({ normalizedInput: 'a b', status: 'pass' })
  })

  it('binds an invocation to an approved response record when supplied', () => {
    expect(evaluateAssessment({
      responseId: 'RESP-001',
      evaluatorId: 'EVAL-finite-choice-v1',
      input: 'A',
      acceptedValues: ['A'],
    })).toMatchObject({ status: 'pass' })
    expect(() => evaluateAssessment({
      responseId: 'RESP-1',
      evaluatorId: 'EVAL-finite-choice-v1',
      input: 'A',
      acceptedValues: ['A'],
    })).toThrow('responseId')
  })

  it('rejects evaluator IDs that are not in the published registry', () => {
    expect(() => evaluateAssessment({
      evaluatorId: 'EVAL-made-up-v1' as 'EVAL-finite-choice-v1',
      input: 'A',
      acceptedValues: ['A'],
    })).toThrow('未发布的判定器')
  })
})
