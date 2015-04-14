////////////////////////////////////////////////////////////////////////////////
/// @brief Infrastructure for RangeInfo
///
/// @file arangod/Aql/RangeInfo.h
///
/// DISCLAIMER
///
/// Copyright 2010-2014 triagens GmbH, Cologne, Germany
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// Copyright holder is triAGENS GmbH, Cologne, Germany
///
/// @author not James
/// @author Copyright 2014, triagens GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

#ifndef ARANGODB_AQL_RANGE_INFO_H
#define ARANGODB_AQL_RANGE_INFO_H 1

#include "Basics/Common.h"
#include "Aql/AstNode.h"
#include "Basics/JsonHelper.h"
#include "Basics/json-utilities.h"

namespace triagens {
  namespace aql {

// -----------------------------------------------------------------------------
// --SECTION--                                              class RangeInfoBound
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief struct to keep an upper or lower bound named _bound and a bool
/// _include which indicates if the _bound is included or not. This can
/// hold a constant value (NODE_TYPE_VALUE) or a subexpression, which is
/// indicated by the boolean flag _isConstant. The whole thing can be
/// not _defined, which counts as _isConstant.
/// We have the following invariants:
///  (! _defined) ==> _isConstant
////////////////////////////////////////////////////////////////////////////////

    struct RangeInfoBound {

// -----------------------------------------------------------------------------
// --SECTION--                                        constructors / destructors
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief constructors
////////////////////////////////////////////////////////////////////////////////

        RangeInfoBound (AstNode const* bound, 
                        bool include) 
          : _bound(), 
            _include(include), 
            _defined(false),
            _expressionAst(nullptr) {

          if (bound->type == NODE_TYPE_VALUE) {
            _bound = triagens::basics::Json(TRI_UNKNOWN_MEM_ZONE,
                                            bound->toJsonValue(TRI_UNKNOWN_MEM_ZONE));
            _isConstant = true;
          }
          else {
            _bound = triagens::basics::Json(TRI_UNKNOWN_MEM_ZONE,
                                            bound->toJson(TRI_UNKNOWN_MEM_ZONE, true));
            _isConstant = false;
            _expressionAst = bound;
          }
          _defined = true;
        }
        
        RangeInfoBound (triagens::basics::Json const& json) 
          : _bound(),
            _include(basics::JsonHelper::checkAndGetBooleanValue(json.json(),
                                                                 "include")),
            _isConstant(basics::JsonHelper::checkAndGetBooleanValue(json.json(),
                                                             "isConstant")),
            _defined(false),
            _expressionAst(nullptr) {
          triagens::basics::Json bound = json.get("bound");

          if (! bound.isEmpty()) {
            _bound = bound;
            _defined = true;
          }
        }

        RangeInfoBound (bool include,
                        bool isConstant,
                        triagens::basics::Json& json) 
          : _bound(),
            _include(include),
            _isConstant(isConstant),
            _defined(false),
            _expressionAst(nullptr) {

          if (! json.isEmpty()) {
            _bound = triagens::basics::Json(TRI_UNKNOWN_MEM_ZONE, json.steal());
            _defined = true;
          }
        }
      
        RangeInfoBound () 
          : _bound(), 
            _include(false), 
            _isConstant(false), 
            _defined(false),
            _expressionAst(nullptr) {
        }

        RangeInfoBound (RangeInfoBound const& copy) 
          : _bound(copy._bound.copy()), 
            _include(copy._include), 
            _isConstant(copy._isConstant), 
            _defined(copy._defined),
            _expressionAst(nullptr) {
        } 
          
////////////////////////////////////////////////////////////////////////////////
/// @brief destructor
////////////////////////////////////////////////////////////////////////////////

        ~RangeInfoBound () {}
      
////////////////////////////////////////////////////////////////////////////////
/// @brief delete assignment
////////////////////////////////////////////////////////////////////////////////

        RangeInfoBound& operator= (RangeInfoBound const& copy) = delete;

// -----------------------------------------------------------------------------
// --SECTION--                                                    public methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief explicit assign
////////////////////////////////////////////////////////////////////////////////

        void assign (basics::Json const& json) {
          _defined = false;   // keep it undefined in case of an exception
          triagens::basics::Json bound = json.get("bound");
          if (! bound.isEmpty()) {
            _bound = bound;
            _defined = true;
          }
          _include = basics::JsonHelper::checkAndGetBooleanValue(
                           json.json(), "include");
          _isConstant = basics::JsonHelper::checkAndGetBooleanValue(
                           json.json(), "isConstant");
          _expressionAst = nullptr;
        }

        void assign (AstNode const* bound, 
                     bool include) {
          _defined = false;  // keep it undefined in case of an exception
          _include = include;
          if (bound->type == NODE_TYPE_VALUE) {
            _bound = triagens::basics::Json(TRI_UNKNOWN_MEM_ZONE,
                                            bound->toJsonValue(TRI_UNKNOWN_MEM_ZONE));
            _isConstant = true;
            _expressionAst = nullptr;
          }
          else {
            _bound = triagens::basics::Json(TRI_UNKNOWN_MEM_ZONE,
                                            bound->toJson(TRI_UNKNOWN_MEM_ZONE, true));
            _isConstant = false;
            _expressionAst = bound;
          }
          _defined = true;
        }
      
        void assign (RangeInfoBound const& copy) {
          _bound = copy._bound.copy(); 
          _include = copy._include;
          _isConstant = copy._isConstant;
          _defined = copy._defined;
          _expressionAst = copy._expressionAst;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief toJson
////////////////////////////////////////////////////////////////////////////////

        triagens::basics::Json toJson() const {
          triagens::basics::Json item(basics::Json::Object, 3);
          if (! _bound.isEmpty()) {
            item("bound", _bound.copy());
          }
          item("include", triagens::basics::Json(_include))
              ("isConstant", triagens::basics::Json(!_defined || _isConstant));
          return item;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief toIndexOperator, doesn't work with unbounded above and below 
/// RangeInfos and only for constant values
////////////////////////////////////////////////////////////////////////////////

        TRI_index_operator_t* toIndexOperator (bool high, 
                                               triagens::basics::Json parameters,
                                               TRI_shaper_t* shaper) const {

          TRI_ASSERT(_isConstant);

          TRI_index_operator_type_e op;

          if (high) {
            if (_include) {
              op = TRI_LE_INDEX_OPERATOR;
            }
            else {
              op = TRI_LT_INDEX_OPERATOR;
            }
          } 
          else {
            if (_include) {
              op = TRI_GE_INDEX_OPERATOR;
            }
            else {
              op = TRI_GT_INDEX_OPERATOR;
            }
          }
          parameters.add(_bound.copy());
          size_t nr = parameters.size();

          return TRI_CreateIndexOperator(op, nullptr, nullptr, parameters.steal(), shaper, nr);
        } 

////////////////////////////////////////////////////////////////////////////////
/// @brief andCombineLowerBounds, changes the bound in *this and replaces
/// it by the stronger bound of *this and that, interpreting both as lower
/// bounds.
////////////////////////////////////////////////////////////////////////////////

        void andCombineLowerBounds (RangeInfoBound const& that);

////////////////////////////////////////////////////////////////////////////////
/// @brief andCombineUpperBounds, changes the bound in *this and replaces
/// it by the stronger bound of *this and that, interpreting both as upper
/// bounds.
////////////////////////////////////////////////////////////////////////////////

        void andCombineUpperBounds (RangeInfoBound const& that);

////////////////////////////////////////////////////////////////////////////////
/// @brief getter for bound
////////////////////////////////////////////////////////////////////////////////

        triagens::basics::Json const& bound() const {
          return _bound;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief getter for inclusion
////////////////////////////////////////////////////////////////////////////////

        bool inclusive () const {
          return _include;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief setter for inclusion
////////////////////////////////////////////////////////////////////////////////
        
        void setInclude (bool value) {
          _include = value;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief getter for isConstant
////////////////////////////////////////////////////////////////////////////////

        bool isConstant () const {
          return ! _defined || _isConstant;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief getter for isDefined
////////////////////////////////////////////////////////////////////////////////

        bool isDefined () const {
          return _defined;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief getExpressionAst, looks up or computes (if necessary) an AST
/// for the variable bound, return nullptr for a constant bound, the new
/// (if needed) nodes are registered with the ast
////////////////////////////////////////////////////////////////////////////////

        AstNode const* getExpressionAst (Ast*) const;

// -----------------------------------------------------------------------------
// --SECTION--                                                 private variables
// -----------------------------------------------------------------------------

      private:

////////////////////////////////////////////////////////////////////////////////
/// @brief _bound as Json, this is either for constant values 
/// (_isConstant==true) or for JSON-serialised subexpressions
/// (_isConstant==false).
////////////////////////////////////////////////////////////////////////////////

        triagens::basics::Json _bound;

////////////////////////////////////////////////////////////////////////////////
/// @brief _include, flag indicating whether or not bound is included
////////////////////////////////////////////////////////////////////////////////

        bool _include;

////////////////////////////////////////////////////////////////////////////////
/// @brief _isConstant, this is true if the bound is a constant value
////////////////////////////////////////////////////////////////////////////////

        bool _isConstant;

////////////////////////////////////////////////////////////////////////////////
/// @brief _defined, if this is true if the bound is defined
////////////////////////////////////////////////////////////////////////////////

        bool _defined;

////////////////////////////////////////////////////////////////////////////////
/// @brief _expressionAst, this remembers the AST for the expression
/// in the variable case, for constant expressions this is always a nullptr.
/// If the bound is made from Json, then _expressionAst is initially set
/// to nullptr and only later computed by getExpressionAst and then
/// cached. Note that the memory management is done by an object of type
/// Ast outside of this class. Therefore the destructor does not delete
/// the pointer here.
////////////////////////////////////////////////////////////////////////////////

        AstNode mutable const* _expressionAst;
    };

// -----------------------------------------------------------------------------
// --SECTION--                                                  struct RangeInfo
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief struct to keep a list of RangeInfoBounds for _lows and one for 
///_highs, as well as constant _lowConst and _highConst. All constant bounds
/// will be combined into _lowConst and _highConst respectively, they
/// can also be not _defined. All bounds in _lows and _highs are defined
/// and not constant. The flag _defined is only false if the whole RangeInfo
/// is not defined (default constructor). 
/// This struct keeps _valid and _equality up to date at all times.
/// _valid is false iff the range is known to be empty. _equality is
/// true iff upper and lower bounds were given as (list of) identical
/// pairs. Note that _equality can be set and yet we only notice that
/// the RangeInfo is empty at runtime, if more than one equality was given!
////////////////////////////////////////////////////////////////////////////////
    
    struct RangeInfo {
        
////////////////////////////////////////////////////////////////////////////////
/// @brief constructors
////////////////////////////////////////////////////////////////////////////////

        RangeInfo (std::string const& var,
                   std::string const& attr,
                   RangeInfoBound low, 
                   RangeInfoBound high,
                   bool equality)
          : _var(var), 
            _attr(attr), 
            _valid(true), 
            _defined(true),
            _equality(equality) {

          if (low.isConstant()) {
            _lowConst.assign(low);
          }
          else {
            _lows.emplace_back(low);
          }

          if (high.isConstant()) {
            _highConst.assign(high);
          }
          else {
            _highs.emplace_back(high);
          }

          // Maybe the range is known to be invalid right away?
          if (_lowConst.isDefined() && _lowConst.isConstant() &&
              _highConst.isDefined() && _highConst.isConstant()) {
            int cmp = TRI_CompareValuesJson(_lowConst.bound().json(),
                                            _highConst.bound().json(), true);
            if (cmp == 1) {
              _valid = false;
            }
            else if (cmp == 0) {
              if (_lowConst.inclusive() && _highConst.inclusive()) {
                _equality = true;
              }
              else {
                _valid = false;
              }
            }
          }
        }

        RangeInfo (std::string const& var,
                   std::string const& attr)
          : _var(var), 
            _attr(attr), 
            _valid(true), 
            _defined(true),
            _equality(false) {
        }

        RangeInfo () 
          : _valid(false), 
            _defined(false), 
            _equality(false) {
        }
        
        RangeInfo (basics::Json const& json);

////////////////////////////////////////////////////////////////////////////////
/// @brief destructor
////////////////////////////////////////////////////////////////////////////////
        
        ~RangeInfo () {
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief delete assignment operator
////////////////////////////////////////////////////////////////////////////////
        
        RangeInfo& operator= (RangeInfo const& copy) = delete;

// -----------------------------------------------------------------------------
// --SECTION--                                                    public methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief toJson
////////////////////////////////////////////////////////////////////////////////
        
        triagens::basics::Json toJson () const;
        
////////////////////////////////////////////////////////////////////////////////
/// @brief toString
////////////////////////////////////////////////////////////////////////////////
        
        std::string toString () const {
          return this->toJson().toString();
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief is1ValueRangeInfo
////////////////////////////////////////////////////////////////////////////////
        
        // is the range a unique value (i.e. something like x<=1 and x>=1),
        // note again that with variable bounds it can turn out only at 
        // runTime that two or more expressions actually contradict each other.
        // In this case this method will return true nevertheless.
        bool is1ValueRangeInfo () const { 
          if (! _defined || ! _valid) {
            return false;
          }
          return _equality;
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief isDefined, getter for _defined
////////////////////////////////////////////////////////////////////////////////

        bool isDefined () const {
          return _defined;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief isValid, getter for _valid
////////////////////////////////////////////////////////////////////////////////

        bool isValid () const {
          return _valid;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief invalidate
////////////////////////////////////////////////////////////////////////////////

        void invalidate () {
          _valid = false;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief isConstant
////////////////////////////////////////////////////////////////////////////////

        bool isConstant () const {
          if (! _defined) {
            return false;
          }
          if (! _valid) {
            return true;
          }
          return _lows.size() == 0 && _highs.size() == 0;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief fuse, fuse two ranges, must be for the same variable and attribute
////////////////////////////////////////////////////////////////////////////////

        void fuse (RangeInfo const& that);

// -----------------------------------------------------------------------------
// --SECTION--                                                  public variables
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief _var, the AQL variable name
////////////////////////////////////////////////////////////////////////////////
        
        std::string _var;

////////////////////////////////////////////////////////////////////////////////
/// @brief _attr, the attribute access in the variable, can have dots meaning
/// deep access
////////////////////////////////////////////////////////////////////////////////
        
        std::string _attr;

////////////////////////////////////////////////////////////////////////////////
/// @brief _lows, all non-constant lower bounds
////////////////////////////////////////////////////////////////////////////////
        
        std::list<RangeInfoBound> _lows;

////////////////////////////////////////////////////////////////////////////////
/// @brief _lowConst, all constant lower bounds combined, or not _defined
////////////////////////////////////////////////////////////////////////////////
        
        RangeInfoBound _lowConst;

////////////////////////////////////////////////////////////////////////////////
/// @brief _highs, all non-constant upper bounds
////////////////////////////////////////////////////////////////////////////////
        
        std::list<RangeInfoBound> _highs;

////////////////////////////////////////////////////////////////////////////////
/// @brief _highConst, all constant upper bounds combined, or not _defined
////////////////////////////////////////////////////////////////////////////////
        
        RangeInfoBound _highConst;

////////////////////////////////////////////////////////////////////////////////
/// @brief revokeEquality, this is used when we withdraw a variable bound,
/// in that case we can no longer trust the _equality bit, no big harm is
/// done, except that we no longer know that the range is only at most a
/// single value
////////////////////////////////////////////////////////////////////////////////

        void revokeEquality () {
          _equality = false;
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief clone
////////////////////////////////////////////////////////////////////////////////

        RangeInfo clone () const {
          RangeInfo copy(_var, _attr);
          
          copy._lowConst.assign(_lowConst);
          copy._highConst.assign(_highConst);

          for (auto x: _lows) {
            copy._lows.emplace_back(x);
          }
          for (auto x: _highs) {
            copy._highs.emplace_back(x);
          }
          copy._valid = _valid;
          copy._defined = _defined;
          copy._equality = _equality;

          return copy;
        }

// -----------------------------------------------------------------------------
// --SECTION--                                                 private variables
// -----------------------------------------------------------------------------
        
      private:

////////////////////////////////////////////////////////////////////////////////
/// @brief _valid, this is set to true iff the range is known to be non-empty
////////////////////////////////////////////////////////////////////////////////

        bool _valid;

////////////////////////////////////////////////////////////////////////////////
/// @brief _defined, this is set iff the range is defined
////////////////////////////////////////////////////////////////////////////////
        
        bool _defined;

////////////////////////////////////////////////////////////////////////////////
/// @brief _equality, range is known to be an equality
////////////////////////////////////////////////////////////////////////////////
        
        bool _equality;
    };

// -----------------------------------------------------------------------------
// --SECTION--                                                class RangeInfoMap
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief class to keep RangeInfos associated to variable and attribute names. 
////////////////////////////////////////////////////////////////////////////////
    
    class RangeInfoMap {
        
      public:
        
        RangeInfoMap (RangeInfoMap const& copy) = delete;
        RangeInfoMap& operator= (RangeInfoMap const& copy) = delete;
        
////////////////////////////////////////////////////////////////////////////////
/// @brief default constructor
////////////////////////////////////////////////////////////////////////////////
    
        RangeInfoMap () : 
          _ranges() {
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief construct RangeInfoMap containing single RangeInfo created from the
/// args
////////////////////////////////////////////////////////////////////////////////
        
        RangeInfoMap (std::string const& var, 
                      std::string const& name, 
                      RangeInfoBound low, 
                      RangeInfoBound high,
                      bool equality); 
        
        RangeInfoMap (RangeInfo);

////////////////////////////////////////////////////////////////////////////////
/// @brief destructor
////////////////////////////////////////////////////////////////////////////////
    
        ~RangeInfoMap() {
        }

// -----------------------------------------------------------------------------
// --SECTION--                                                    public methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief find, find all the range infos for variable <var>,
/// ownership is not transferred
////////////////////////////////////////////////////////////////////////////////

        std::unordered_map<std::string, RangeInfo> const* find (std::string const& var) const {
          auto it = _ranges.find(var);

          if (it == _ranges.end()) {
            return nullptr;
          }

          return &((*it).second);
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief find, find all the range infos for variable <var>,
/// ownership is not transferred
////////////////////////////////////////////////////////////////////////////////

        std::unordered_map<std::string, RangeInfo>* find (std::string const& var) {
          auto it = _ranges.find(var);
          if (it == _ranges.end()) {
            return nullptr;
          }
          return &((*it).second);
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief find, find all the range info for variable <var> and attribute <attr>
/// ownership is not transferred
////////////////////////////////////////////////////////////////////////////////
        
        RangeInfo* find (std::string const& var, std::string const& attr) {
          auto map = find(var);

          if (map == nullptr) {
            return nullptr;
          }
          
          auto it = map->find(attr);

          if (it == map->end()){
            return nullptr;
          }

          return &((*it).second);
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief insert, insert if it's not already there and otherwise
/// intersection with existing range, for variable values we keep them all.
/// The equality flag should be set if and only if the caller knows that the
/// lower and upper bound are equal, this is particularly important if the
/// bounds are variable and can only be computed at runtime.
////////////////////////////////////////////////////////////////////////////////
    
        void insert (std::string const& var, 
                     std::string const& name, 
                     RangeInfoBound low, 
                     RangeInfoBound high,
                     bool equality);

////////////////////////////////////////////////////////////////////////////////
/// @brief insert, directly using a RangeInfo structure
////////////////////////////////////////////////////////////////////////////////

        void insert (RangeInfo const& range);
       
////////////////////////////////////////////////////////////////////////////////
/// @brief insert, directly using a RangeInfo structure
////////////////////////////////////////////////////////////////////////////////

        void erase (RangeInfo*);

////////////////////////////////////////////////////////////////////////////////
/// @brief size, the number of range infos stored
////////////////////////////////////////////////////////////////////////////////
    
        size_t size () const {
          return _ranges.size();
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief empty, the number of range infos stored
////////////////////////////////////////////////////////////////////////////////
        
        bool empty () const {
          return _ranges.empty();
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief toString, via Json
////////////////////////////////////////////////////////////////////////////////
    
        std::string toString() const {
          return this->toJson().toString();
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief toJson
////////////////////////////////////////////////////////////////////////////////
    
        triagens::basics::Json toJson() const {
          triagens::basics::Json list(triagens::basics::Json::Array);
          for (auto x : _ranges) {
            for (auto y: x.second) {
              triagens::basics::Json item(triagens::basics::Json::Object);
              item("variable", triagens::basics::Json(x.first))
                  ("attribute name", triagens::basics::Json(y.first))
                  ("range info", y.second.toJson());
              list(item);
            }
          }
          return list;
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief clone
////////////////////////////////////////////////////////////////////////////////
        
        RangeInfoMap* clone () const;

////////////////////////////////////////////////////////////////////////////////
/// @brief eraseEmptyOrUndefined remove all empty or undefined RangeInfos for
/// the variable <var> in the RIM
////////////////////////////////////////////////////////////////////////////////
        
        void eraseEmptyOrUndefined (std::string const&);

////////////////////////////////////////////////////////////////////////////////
/// @brief isValid: are all the range infos for the variable <var> valid?
////////////////////////////////////////////////////////////////////////////////
        
        bool isValid (std::string const&) const;

////////////////////////////////////////////////////////////////////////////////
/// @brief attributes: insert attributes of the variable <var> into set
////////////////////////////////////////////////////////////////////////////////

       void attributes (std::unordered_set<std::string>& set, std::string const& var);

////////////////////////////////////////////////////////////////////////////////
/// @brief return the names of variables contained in the RangeInfoMap
////////////////////////////////////////////////////////////////////////////////

       std::unordered_set<std::string> variables() const;

////////////////////////////////////////////////////////////////////////////////
/// @brief private data
/// TODO: make iterators for this i.e. method for begin and end, so that this
/// can be private
////////////////////////////////////////////////////////////////////////////////
    
        std::unordered_map<std::string, std::unordered_map<std::string,
          RangeInfo>> _ranges; 
        
    };

// -----------------------------------------------------------------------------
// --SECTION--                                             class RangeInfoMapVec
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @brief class to keep a vector of rangeInfoMapVec associated to variable and
/// attribute names, which will be or-combined 
////////////////////////////////////////////////////////////////////////////////
    
    class RangeInfoMapVec {
        
      public:
        
        RangeInfoMapVec (RangeInfoMapVec const& copy) = delete;
        RangeInfoMapVec& operator= (RangeInfoMapVec const& copy) = delete;
        
////////////////////////////////////////////////////////////////////////////////
/// @brief default constructor
////////////////////////////////////////////////////////////////////////////////
    
        RangeInfoMapVec () : 
          _rangeInfoMapVec() {
        }
       
////////////////////////////////////////////////////////////////////////////////
/// @brief constructor: construct RangeInfoMapVec containing a single
/// RangeInfoMap containing a single RangeInfo.
////////////////////////////////////////////////////////////////////////////////
        
        explicit RangeInfoMapVec (RangeInfoMap* rim);

////////////////////////////////////////////////////////////////////////////////
/// @brief destructor
////////////////////////////////////////////////////////////////////////////////
    
        ~RangeInfoMapVec(); 

// -----------------------------------------------------------------------------
// --SECTION--                                                    public methods
// -----------------------------------------------------------------------------
        
////////////////////////////////////////////////////////////////////////////////
/// @brief toString, via Json
////////////////////////////////////////////////////////////////////////////////
    
        std::string toString() const {
          return this->toJson().toString();
        }
        
////////////////////////////////////////////////////////////////////////////////
/// @brief toJson
////////////////////////////////////////////////////////////////////////////////
    
        triagens::basics::Json toJson() const {
          triagens::basics::Json list(triagens::basics::Json::Array);
          for (size_t i = 0; i < _rangeInfoMapVec.size(); i++) {
            list(_rangeInfoMapVec[i]->toJson());
          }
          return list;
        }
      
////////////////////////////////////////////////////////////////////////////////
/// @brief operator[]
////////////////////////////////////////////////////////////////////////////////
        
        RangeInfoMap* operator[] (size_t pos) {
          return _rangeInfoMapVec[pos];
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief size: the number of RangeInfoMaps in the vector
////////////////////////////////////////////////////////////////////////////////
        
        size_t size () const {
          return _rangeInfoMapVec.size();
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief empty: is the vector of RangeInfoMaps empty
////////////////////////////////////////////////////////////////////////////////
        
        bool empty () const {
          return _rangeInfoMapVec.empty();
        }

////////////////////////////////////////////////////////////////////////////////
/// @brief emplace_back: emplace_back RangeInfoMap in vector
////////////////////////////////////////////////////////////////////////////////

        void emplace_back (RangeInfoMap*);

////////////////////////////////////////////////////////////////////////////////
/// @brief eraseEmptyOrUndefined remove all empty or undefined RangeInfos for
/// the variable <var> in every RangeInfoMap in the vector 
////////////////////////////////////////////////////////////////////////////////

        void eraseEmptyOrUndefined (std::string const& var);

////////////////////////////////////////////////////////////////////////////////
/// @brief find: this is the same as _rangeInfoMapVec[pos]->find(var), i.e. find
/// the map of RangeInfos for the variable <var>.
////////////////////////////////////////////////////////////////////////////////

        std::unordered_map<std::string, RangeInfo>* find (std::string const& var, size_t pos) const;

////////////////////////////////////////////////////////////////////////////////
/// @brief differenceRangeInfo: returns the difference of the constant parts of
/// the given RangeInfo and the union of the RangeInfos (for the same var and
/// attr) in the vector. Potentially modifies both the argument and the
/// RangeInfos in the vector.
////////////////////////////////////////////////////////////////////////////////
        
        void differenceRangeInfo (RangeInfo&);

////////////////////////////////////////////////////////////////////////////////
/// @brief isMapped: is the input variable in every RIM in the vector
////////////////////////////////////////////////////////////////////////////////
        
        bool isMapped (std::string const&) const;

////////////////////////////////////////////////////////////////////////////////
/// @brief validPositions: returns a vector of the positions in the RIM vector
/// that contain valid RangeInfoMap for the variable named var
////////////////////////////////////////////////////////////////////////////////

        std::vector<size_t> validPositions (std::string const& var) const; 

////////////////////////////////////////////////////////////////////////////////
/// @brief attributes: returns a vector of the names of the attributes for the
/// variable var stored in the RIM vector (i.e. stored in some RIM in the
/// vector).
////////////////////////////////////////////////////////////////////////////////

        std::unordered_set<std::string> attributes (std::string const& var);

////////////////////////////////////////////////////////////////////////////////
/// @brief private data
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                                 private variables
// -----------------------------------------------------------------------------
    
      private: 

        std::vector<RangeInfoMap*> _rangeInfoMapVec; 
    };

////////////////////////////////////////////////////////////////////////////////
/// @brief andCombineRangeInfoMaps: insert every RangeInfo in the right argument
/// in a new copy of the left argument
////////////////////////////////////////////////////////////////////////////////

    RangeInfoMap* andCombineRangeInfoMaps (RangeInfoMap*, RangeInfoMap*);

////////////////////////////////////////////////////////////////////////////////
/// @brief orCombineRangeInfoMapVecs: return a new RangeInfoMapVec appending
/// those RIMs in the right arg (which are not identical to an existing RIM) in
/// a copy of the left arg.
///
/// The return RIMV is new unless one of the arguments is empty.
////////////////////////////////////////////////////////////////////////////////

    RangeInfoMapVec* orCombineRangeInfoMapVecs (RangeInfoMapVec*, RangeInfoMapVec*);

////////////////////////////////////////////////////////////////////////////////
/// @brief andCombineRangeInfoMapVecs: return a new RangeInfoMapVec by
/// distributing the AND into the ORs in a condition like:
/// (OR condition) AND (OR condition).
///
/// The return RIMV is new unless one of the arguments is empty.
////////////////////////////////////////////////////////////////////////////////

    RangeInfoMapVec* andCombineRangeInfoMapVecs (RangeInfoMapVec*, RangeInfoMapVec*);

////////////////////////////////////////////////////////////////////////////////
/// @brief andCombineRangeInfoMapVecs: same as before, but will return the
/// mapvec even if one side is a nullptr
////////////////////////////////////////////////////////////////////////////////

    RangeInfoMapVec* andCombineRangeInfoMapVecsIgnoreEmpty (RangeInfoMapVec*, RangeInfoMapVec*);

////////////////////////////////////////////////////////////////////////////////
/// @brief IndexOrCondition, type for vector of vector of RangeInfo. The meaning
/// is: the outer vector means an implicit "OR" between the entries. Each
/// entry is a vector whose entries correspond to the attributes of the
/// index. They are a RangeInfo specifying the condition for that attribute.
/// Note that in the variable range bound case one RangeInfo can contain
/// multiple conditions which are implicitly "AND"ed.
////////////////////////////////////////////////////////////////////////////////
    
    typedef std::vector<RangeInfo> IndexAndCondition;
    typedef std::vector<IndexAndCondition> IndexOrCondition;

////////////////////////////////////////////////////////////////////////////////
/// @brief differenceRangeInfos: returns the difference of the constant parts of
/// the given RangeInfos. 
///
/// Modifies either lhs or rhs in place, so that the constant parts of lhs 
/// and rhs are disjoint, and the union of the modified lhs and rhs equals the
/// union of the originals.
////////////////////////////////////////////////////////////////////////////////
    
    void differenceRangeInfos (RangeInfo&, RangeInfo&);

////////////////////////////////////////////////////////////////////////////////
// @brief areDisjointRangeInfos: returns true if the constant parts of lhs and
// rhs are disjoint and false otherwise.
// Only for range infos with the same variable and attribute
////////////////////////////////////////////////////////////////////////////////

    bool areDisjointRangeInfos (RangeInfo const&, RangeInfo const&);

////////////////////////////////////////////////////////////////////////////////
/// @brief areDisjointIndexAndConditions: returns true if the arguments describe
/// disjoint sets. 
////////////////////////////////////////////////////////////////////////////////

    bool areDisjointIndexAndConditions (IndexAndCondition const&, 
                                        IndexAndCondition const&);
    
////////////////////////////////////////////////////////////////////////////////
/// @brief isContainedIndexAndConditions: returns true if the first argument is
/// contained in the second, and false otherwise.
////////////////////////////////////////////////////////////////////////////////

    bool isContainedIndexAndConditions (IndexAndCondition const&, 
                                        IndexAndCondition const&);

////////////////////////////////////////////////////////////////////////////////
/// @brief differenceIndexAnd: modifies and1 and and2 in place 
/// so that the intersection of the sets they describe is empty and their union
/// is the same as if the function was never called. 
////////////////////////////////////////////////////////////////////////////////

    void differenceIndexAnd (IndexAndCondition&, IndexAndCondition&);

////////////////////////////////////////////////////////////////////////////////
/// @brief isContainedIndexAndConditions: returns true if the first argument is
/// contained in the second, and false otherwise.
////////////////////////////////////////////////////////////////////////////////

    void removeOverlapsIndexOr (IndexOrCondition&);

  }
}

#endif
