"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, Folder, FolderOpen, File as FileIcon } from "lucide-react"
import { buildTree, collectPaths } from "@/lib/restore-tree"
import type { FileTreeProps, TreeNode, TreeFileNode, FileRowProps, DirRowProps, TreeItemProps } from "@/types/restore"
import { formatNumber, formatSize, cn } from "@/lib/utils"
import * as styles from "./file-tree.styles"

const matchesSearch = (node: TreeNode | TreeFileNode, needle: string): boolean => node.name.toLowerCase().includes(needle)

const nodeMatches = (node: TreeNode, needle: string): boolean =>
  matchesSearch(node, needle) || node.files.some((f) => matchesSearch(f, needle)) || node.children.some((child) => nodeMatches(child, needle))

const FileRow = ({ file, selected, onToggle }: FileRowProps) => (
  <label className={cn(styles.row, styles.fileRow, selected && styles.rowSelected)}>
    <input type="checkbox" data-file-checkbox className={styles.checkbox} checked={selected} onChange={onToggle} />
    <FileIcon className={styles.fileIcon} />
    <span className={styles.fileName}>{file.name}</span>
    <span className={styles.fileSize}>{formatSize(file.size)}</span>
  </label>
)

const DirRow = ({ node, expanded, selectionState, onToggleExpand, onToggleDir }: DirRowProps) => {
  const { t } = useTranslation()

  return (
    <div className={cn(styles.row, styles.dirRow)}>
      <button type="button" className={styles.chevronBtn} onClick={onToggleExpand} aria-label={t(expanded ? "common.collapse" : "common.expand")}>
        <ChevronRight className={cn(styles.chevron, expanded && styles.chevronOpen)} />
      </button>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={selectionState === "all"}
        ref={(el) => {
          if (el) el.indeterminate = selectionState === "some"
        }}
        onChange={onToggleDir}
      />
      {expanded ? <FolderOpen className={styles.dirIcon} /> : <Folder className={styles.dirIcon} />}
      <span className={styles.dirName}>{node.name}</span>
      <span className={styles.count}>({formatNumber(node.fileCount)})</span>
    </div>
  )
}

const TreeItem = ({ node, depth, expandedDirs, selected, needle, onToggleExpand, onTogglePath, onToggleMany }: TreeItemProps) => {
  const isExpanded = expandedDirs.has(node.path)
  const visibleChildren = needle ? node.children.filter((child) => nodeMatches(child, needle)) : node.children
  const visibleFiles = needle ? node.files.filter((f) => matchesSearch(f, needle)) : node.files

  const allPaths: string[] = []
  collectPaths(node, allPaths)
  const selectedCount = allPaths.filter((p) => selected.has(p)).length
  const selectionState: "none" | "some" | "all" = selectedCount === 0 ? "none" : selectedCount === allPaths.length ? "all" : "some"

  const toggleDir = (): void => {
    onToggleMany(allPaths, selectionState !== "all")
  }

  return (
    <div>
      <DirRow
        node={node}
        expanded={isExpanded || !!needle}
        selectionState={selectionState}
        onToggleExpand={() => {
          onToggleExpand(node.path)
        }}
        onToggleDir={toggleDir}
      />
      {(isExpanded || !!needle) && (
        <div className={styles.children}>
          {visibleFiles.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              selected={selected.has(file.path)}
              onToggle={() => {
                onTogglePath(file.path)
              }}
            />
          ))}
          {visibleChildren.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              selected={selected}
              needle={needle}
              onToggleExpand={onToggleExpand}
              onTogglePath={onTogglePath}
              onToggleMany={onToggleMany}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const FileTree = ({ files, search, selected, onTogglePath, onToggleMany }: FileTreeProps) => {
  const { t } = useTranslation()
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(files), [files])
  const needle = search.trim().toLowerCase()

  const toggleExpand = (path: string): void => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const rootChildren = tree.children

  return (
    <div className={styles.tree}>
      {rootChildren.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={0}
          expandedDirs={expandedDirs}
          selected={selected}
          needle={needle}
          onToggleExpand={toggleExpand}
          onTogglePath={onTogglePath}
          onToggleMany={onToggleMany}
        />
      ))}
      {tree.files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          selected={selected.has(file.path)}
          onToggle={() => {
            onTogglePath(file.path)
          }}
        />
      ))}
      {rootChildren.length === 0 && tree.files.length === 0 && <p className={styles.empty}>{t("restore.noFiles")}</p>}
    </div>
  )
}

export { FileTree }
