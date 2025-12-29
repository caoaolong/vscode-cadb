/**
 * SQL 输入增强组件
 * 提供语法高亮和自动完成功能
 */

class SQLInput {
  constructor(inputElement, options = {}) {
    this.input = $(inputElement);
    this.options = {
      onEnter: options.onEnter || null,
      placeholder: options.placeholder || '',
      keywords: options.keywords || this.getDefaultKeywords(),
      ...options
    };

    this.autocompleteList = null;
    this.currentSuggestions = [];
    this.selectedIndex = -1;

    this.init();
  }

  /**
   * 获取默认的 SQL 关键字
   */
  getDefaultKeywords() {
    return [
      // WHERE 子句常用
      'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL',
      'TRUE', 'FALSE', 'EXISTS', 'ANY', 'ALL',
      // ORDER BY 子句常用
      'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
      // 常用函数
      'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
      'UPPER', 'LOWER', 'LENGTH', 'TRIM',
      'DATE', 'NOW', 'YEAR', 'MONTH', 'DAY',
      // 运算符
      '=', '!=', '<>', '<', '>', '<=', '>=',
    ];
  }

  /**
   * 初始化组件
   */
  init() {
    // 创建自动完成容器
    this.createAutocompleteList();

    // 绑定事件
    this.bindEvents();

    // 设置初始样式
    this.input.addClass('sql-input-enhanced');
  }

  /**
   * 创建自动完成列表
   */
  createAutocompleteList() {
    this.autocompleteList = $('<ul class="sql-autocomplete-list"></ul>');
    this.autocompleteList.hide();
    this.input.after(this.autocompleteList);
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const self = this;

    // 输入事件 - 显示自动完成
    this.input.on('input', function(e) {
      self.handleInput(e);
    });

    // 键盘事件
    this.input.on('keydown', function(e) {
      self.handleKeyDown(e);
    });

    // 失去焦点 - 隐藏自动完成
    this.input.on('blur', function() {
      setTimeout(() => {
        self.hideAutocomplete();
      }, 200);
    });

    // 点击文档其他地方 - 隐藏自动完成
    $(document).on('click', function(e) {
      if (!$(e.target).closest('.sql-input-enhanced, .sql-autocomplete-list').length) {
        self.hideAutocomplete();
      }
    });
  }

  /**
   * 处理输入
   */
  handleInput(e) {
    const value = this.input.val();
    const cursorPos = this.input[0].selectionStart;

    // 获取当前单词
    const currentWord = this.getCurrentWord(value, cursorPos);

    if (currentWord.length >= 1) {
      this.showSuggestions(currentWord);
    } else {
      this.hideAutocomplete();
    }

    // 应用语法高亮（通过添加 CSS 类）
    this.applySyntaxHighlight();
  }

  /**
   * 获取光标位置的当前单词
   */
  getCurrentWord(text, pos) {
    const beforeCursor = text.substring(0, pos);
    const match = beforeCursor.match(/[a-zA-Z_]\w*$/);
    return match ? match[0] : '';
  }

  /**
   * 显示建议列表
   */
  showSuggestions(word) {
    const upperWord = word.toUpperCase();
    this.currentSuggestions = this.options.keywords.filter(keyword => 
      keyword.toUpperCase().startsWith(upperWord)
    );

    if (this.currentSuggestions.length === 0) {
      this.hideAutocomplete();
      return;
    }

    // 清空并填充建议
    this.autocompleteList.empty();
    this.currentSuggestions.forEach((suggestion, index) => {
      const li = $('<li></li>')
        .text(suggestion)
        .attr('data-index', index)
        .on('mousedown', (e) => {
          e.preventDefault();
          this.selectSuggestion(index);
        })
        .on('mouseenter', () => {
          this.setSelectedIndex(index);
        });
      
      this.autocompleteList.append(li);
    });

    // 定位和显示
    this.positionAutocomplete();
    this.autocompleteList.show();
    this.selectedIndex = -1;
  }

  /**
   * 定位自动完成列表
   */
  positionAutocomplete() {
    const offset = this.input.offset();
    const height = this.input.outerHeight();

    this.autocompleteList.css({
      position: 'absolute',
      top: offset.top + height,
      left: offset.left,
      minWidth: this.input.outerWidth()
    });
  }

  /**
   * 隐藏自动完成
   */
  hideAutocomplete() {
    this.autocompleteList.hide();
    this.currentSuggestions = [];
    this.selectedIndex = -1;
  }

  /**
   * 选择建议
   */
  selectSuggestion(index) {
    if (index < 0 || index >= this.currentSuggestions.length) {
      return;
    }

    const suggestion = this.currentSuggestions[index];
    const value = this.input.val();
    const cursorPos = this.input[0].selectionStart;
    
    // 获取当前单词的起始位置
    const beforeCursor = value.substring(0, cursorPos);
    const match = beforeCursor.match(/[a-zA-Z_]\w*$/);
    const wordStart = match ? cursorPos - match[0].length : cursorPos;
    
    // 替换当前单词
    const newValue = value.substring(0, wordStart) + suggestion + ' ' + value.substring(cursorPos);
    this.input.val(newValue);
    
    // 设置光标位置
    const newCursorPos = wordStart + suggestion.length + 1;
    this.input[0].setSelectionRange(newCursorPos, newCursorPos);
    
    this.hideAutocomplete();
    this.input.focus();
  }

  /**
   * 设置选中的索引
   */
  setSelectedIndex(index) {
    this.selectedIndex = index;
    this.autocompleteList.find('li').removeClass('selected');
    if (index >= 0 && index < this.currentSuggestions.length) {
      this.autocompleteList.find(`li[data-index="${index}"]`).addClass('selected');
    }
  }

  /**
   * 处理键盘按下
   */
  handleKeyDown(e) {
    // 如果自动完成列表可见
    if (this.autocompleteList.is(':visible')) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.setSelectedIndex((this.selectedIndex + 1) % this.currentSuggestions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          const newIndex = this.selectedIndex - 1;
          this.setSelectedIndex(newIndex < 0 ? this.currentSuggestions.length - 1 : newIndex);
          break;
        case 'Enter':
          e.preventDefault();
          if (this.selectedIndex >= 0) {
            this.selectSuggestion(this.selectedIndex);
          } else if (this.currentSuggestions.length > 0) {
            this.selectSuggestion(0);
          } else {
            this.hideAutocomplete();
            if (this.options.onEnter) {
              this.options.onEnter(this.input.val());
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          this.hideAutocomplete();
          break;
        case 'Tab':
          e.preventDefault();
          if (this.selectedIndex >= 0) {
            this.selectSuggestion(this.selectedIndex);
          } else if (this.currentSuggestions.length > 0) {
            this.selectSuggestion(0);
          }
          break;
      }
    } else {
      // 自动完成列表不可见时
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.options.onEnter) {
          this.options.onEnter(this.input.val());
        }
      }
    }
  }

  /**
   * 应用语法高亮（简单实现 - 使用 CSS 类）
   */
  applySyntaxHighlight() {
    const value = this.input.val();
    const hasKeywords = this.options.keywords.some(keyword => 
      value.toUpperCase().includes(keyword.toUpperCase())
    );

    if (hasKeywords) {
      this.input.addClass('has-sql-syntax');
    } else {
      this.input.removeClass('has-sql-syntax');
    }
  }

  /**
   * 获取值
   */
  getValue() {
    return this.input.val().trim();
  }

  /**
   * 设置值
   */
  setValue(value) {
    this.input.val(value);
    this.applySyntaxHighlight();
  }

  /**
   * 清空
   */
  clear() {
    this.input.val('');
    this.hideAutocomplete();
  }

  /**
   * 销毁
   */
  destroy() {
    this.input.off();
    this.autocompleteList.remove();
    this.input.removeClass('sql-input-enhanced has-sql-syntax');
  }
}

// 导出到全局
window.SQLInput = SQLInput;

