import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import logger from '../logger.js';
import { createContentResponse, createErrorResponse } from './utils.js';

/**
 * Format complexity analysis results for display
 * @param {Object} report - Complexity report data
 * @returns {Object} Formatted display data
 */
function formatComplexityDisplay(report) {
  if (!report?.complexityAnalysis || !Array.isArray(report.complexityAnalysis)) {
    return null;
  }

  const analysis = report.complexityAnalysis;
  const meta = report.meta || {};

  // Sort by complexity score (highest first)
  const sortedAnalysis = [...analysis].sort((a, b) => (b.complexityScore || 0) - (a.complexityScore || 0));

  // Calculate statistics
  const totalAnalyzed = analysis.length;
  const complexityScores = analysis.map(a => a.complexityScore || 0);
  const averageComplexity = totalAnalyzed > 0 ? 
    complexityScores.reduce((sum, score) => sum + score, 0) / totalAnalyzed : 0;
  
  const highComplexity = analysis.filter(a => (a.complexityScore || 0) >= 7);
  const mediumComplexity = analysis.filter(a => (a.complexityScore || 0) >= 4 && (a.complexityScore || 0) < 7);
  const lowComplexity = analysis.filter(a => (a.complexityScore || 0) < 4);

  // Expansion recommendations
  const needsExpansion = analysis.filter(a => (a.complexityScore || 0) >= (meta.thresholdScore || 5));
  const totalRecommendedSubtasks = analysis.reduce((sum, a) => sum + (a.recommendedSubtasks || 0), 0);

  return {
    metadata: {
      generatedAt: meta.generatedAt || 'Unknown',
      tasksAnalyzed: meta.tasksAnalyzed || totalAnalyzed,
      totalTasks: meta.totalTasks || totalAnalyzed,
      thresholdScore: meta.thresholdScore || 5,
      usedResearch: meta.usedResearch || false,
      batchProcessing: meta.batchProcessing || null
    },
    statistics: {
      totalAnalyzed,
      averageComplexity: parseFloat(averageComplexity.toFixed(2)),
      distribution: {
        high: { count: highComplexity.length, percentage: parseFloat(((highComplexity.length / totalAnalyzed) * 100).toFixed(1)) },
        medium: { count: mediumComplexity.length, percentage: parseFloat(((mediumComplexity.length / totalAnalyzed) * 100).toFixed(1)) },
        low: { count: lowComplexity.length, percentage: parseFloat(((lowComplexity.length / totalAnalyzed) * 100).toFixed(1)) }
      },
      expansion: {
        tasksNeedingExpansion: needsExpansion.length,
        totalRecommendedSubtasks,
        averageSubtasksPerTask: totalAnalyzed > 0 ? parseFloat((totalRecommendedSubtasks / totalAnalyzed).toFixed(1)) : 0
      }
    },
    highComplexityTasks: highComplexity.map(task => ({
      taskId: task.taskId,
      title: task.taskTitle,
      complexityScore: task.complexityScore,
      recommendedSubtasks: task.recommendedSubtasks,
      reasoning: task.reasoning
    })),
    allTasks: sortedAnalysis.map(task => ({
      taskId: task.taskId,
      title: task.taskTitle,
      complexityScore: task.complexityScore,
      recommendedSubtasks: task.recommendedSubtasks,
      complexity: getComplexityLabel(task.complexityScore),
      expansionPrompt: task.expansionPrompt || 'None provided'
    }))
  };
}

/**
 * Get complexity label based on score
 * @param {number} score - Complexity score
 * @returns {string} Complexity label
 */
function getComplexityLabel(score) {
  if (score >= 7) return '🔴 High';
  if (score >= 4) return '🟡 Medium';
  return '🟢 Low';
}

/**
 * Register the complexity-report tool
 * @param {Object} server - FastMCP server instance
 */
export function registerComplexityReportTool(server) {
  server.addTool({
    name: 'complexity_report',
    description: 'Display complexity analysis report for tasks with detailed metrics and recommendations.',
    parameters: z.object({
      projectRoot: z
        .string()
        .describe('The root directory of the project containing .taskmaster folder')
    }),
    execute: async (args) => {
      try {
        const { projectRoot } = args;
        
        logger.info('Displaying task complexity report');
        
        const reportPath = path.join(projectRoot, '.taskmaster', 'complexity-report.json');
        
        // Check if report exists
        if (!fs.existsSync(reportPath)) {
          return createErrorResponse(`No complexity report found at ${reportPath}. Run analyze_task_complexity first to generate a report.`);
        }
        
        // Read and parse report
        let reportData;
        try {
          reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        } catch (parseError) {
          return createErrorResponse(`Failed to parse complexity report: ${parseError.message}`);
        }
        
        // Format report for display
        const formattedReport = formatComplexityDisplay(reportData);
        if (!formattedReport) {
          return createErrorResponse('Invalid complexity report format. Please regenerate the report using analyze_task_complexity.');
        }
        
        const output = {
          success: true,
          report: formattedReport,
          summary: {
            totalTasks: formattedReport.statistics.totalAnalyzed,
            averageComplexity: formattedReport.statistics.averageComplexity,
            highComplexityTasks: formattedReport.statistics.distribution.high.count,
            tasksNeedingExpansion: formattedReport.statistics.expansion.tasksNeedingExpansion,
            recommendedSubtasks: formattedReport.statistics.expansion.totalRecommendedSubtasks
          },
          recommendations: formattedReport.statistics.expansion.tasksNeedingExpansion > 0 ? [
            `${formattedReport.statistics.expansion.tasksNeedingExpansion} task(s) exceed the complexity threshold`,
            `Consider expanding high-complexity tasks using the expand_task tool`,
            `Total of ${formattedReport.statistics.expansion.totalRecommendedSubtasks} subtasks recommended`
          ] : [
            'All tasks are within acceptable complexity levels',
            'No immediate expansion needed'
          ],
          reportLocation: reportPath,
          lastGenerated: formattedReport.metadata.generatedAt
        };
        
        logger.info(`Displayed complexity report: ${formattedReport.statistics.totalAnalyzed} tasks analyzed, ${formattedReport.statistics.distribution.high.count} high complexity`);
        
        return createContentResponse(output);
        
      } catch (error) {
        logger.error(`Failed to display complexity report: ${error.message}`, { error: error.stack, args });
        return createErrorResponse(`Failed to display complexity report: ${error.message}`);
      }
    }
  });
}
